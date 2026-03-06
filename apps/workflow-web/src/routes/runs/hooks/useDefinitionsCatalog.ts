import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ListDefinitionsResponse } from '../../../transport/workflowApiClient';
import { workflowApiClient } from '../../../transport/workflowApiClient';

export type DefinitionsCatalogState = UseQueryResult<ListDefinitionsResponse, Error> & {
  definitions: ListDefinitionsResponse['items'];
};

export const useDefinitionsCatalog = (enabled: boolean): DefinitionsCatalogState => {
  const query = useQuery({
    queryKey: ['workflow-definitions'],
    queryFn: () => workflowApiClient.listDefinitions(),
    enabled,
  });

  return useMemo(
    () => ({
      ...query,
      definitions: query.data?.items ?? [],
    }),
    [query],
  );
};
