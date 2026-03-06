import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { StartWorkflowRequest } from '../../../transport/workflowApiClient';
import { useDefinitionsCatalog } from '../hooks/useDefinitionsCatalog';
import { useStartWorkflow } from '../hooks/useStartWorkflow';

type StartWorkflowDialogProps = {
  open: boolean;
  onClose: () => void;
};

type JsonParseResult<TValue> = { valid: true; value: TValue } | { valid: false; error: string };

const INPUT_DEFAULT_VALUE = '';
const METADATA_DEFAULT_VALUE = '';

const parseRequiredJson = (value: string): JsonParseResult<unknown> => {
  if (value.trim().length === 0) {
    return { valid: false, error: 'Input JSON is required.' };
  }

  try {
    return { valid: true, value: JSON.parse(value) as unknown };
  } catch {
    return { valid: false, error: 'Input JSON must be syntactically valid.' };
  }
};

const parseOptionalMetadata = (
  value: string,
): JsonParseResult<Record<string, unknown> | undefined> => {
  if (value.trim().length === 0) {
    return { valid: true, value: undefined };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { valid: false, error: 'Metadata JSON must be an object.' };
    }

    return { valid: true, value: parsed as Record<string, unknown> };
  } catch {
    return { valid: false, error: 'Metadata JSON must be syntactically valid.' };
  }
};

const formatValidationDetails = (details: Record<string, unknown> | null): string | null => {
  if (details === null) {
    return null;
  }

  return JSON.stringify(details, null, 2);
};

export const StartWorkflowDialog = ({ open, onClose }: StartWorkflowDialogProps): ReactElement => {
  const navigate = useNavigate();
  const [workflowType, setWorkflowType] = useState('');
  const [inputJson, setInputJson] = useState(INPUT_DEFAULT_VALUE);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [metadataJson, setMetadataJson] = useState(METADATA_DEFAULT_VALUE);

  const definitionsCatalog = useDefinitionsCatalog(open);
  const startWorkflow = useStartWorkflow();

  const inputState = useMemo(() => parseRequiredJson(inputJson), [inputJson]);
  const metadataState = useMemo(() => parseOptionalMetadata(metadataJson), [metadataJson]);

  const canSubmit =
    workflowType.trim().length > 0 &&
    inputState.valid &&
    metadataState.valid &&
    !definitionsCatalog.isLoading &&
    !startWorkflow.state.isSubmitting;

  const validationDetails = formatValidationDetails(startWorkflow.state.validationDetails);
  const showSubmitRetry =
    startWorkflow.state.errorMessage !== null && startWorkflow.state.status === null;

  const handleClose = (): void => {
    startWorkflow.clearState();
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (!inputState.valid || !metadataState.valid) {
      return;
    }

    const request: StartWorkflowRequest = {
      workflowType: workflowType.trim(),
      input: inputState.value,
      ...(idempotencyKey.trim().length > 0 ? { idempotencyKey: idempotencyKey.trim() } : {}),
      ...(metadataState.value ? { metadata: metadataState.value } : {}),
    };

    const outcome = await startWorkflow.submit(request);
    if (outcome.kind !== 'success') {
      return;
    }

    startWorkflow.clearState();
    onClose();
    navigate(`/runs/${outcome.response.runId}`);
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Start workflow</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Choose a server-registered workflow type, provide valid JSON input, and optionally add
            an idempotency key or metadata object.
          </Typography>

          {definitionsCatalog.isError ? (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => void definitionsCatalog.refetch()}
                >
                  Retry
                </Button>
              }
            >
              {(definitionsCatalog.error as Error).message}
            </Alert>
          ) : null}

          {startWorkflow.state.errorMessage ? (
            <Alert
              severity={startWorkflow.state.status === 400 ? 'warning' : 'error'}
              action={
                showSubmitRetry ? (
                  <Button color="inherit" size="small" onClick={() => void handleSubmit()}>
                    Retry submit
                  </Button>
                ) : undefined
              }
            >
              <Stack spacing={1}>
                <Typography variant="body2">{startWorkflow.state.errorMessage}</Typography>
                {validationDetails ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'background.default',
                      overflowX: 'auto',
                      fontSize: '0.75rem',
                    }}
                  >
                    {validationDetails}
                  </Box>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          <TextField
            select
            label="Workflow type"
            value={workflowType}
            onChange={(event) => {
              setWorkflowType(event.target.value);
              startWorkflow.clearState();
            }}
            disabled={definitionsCatalog.isLoading || definitionsCatalog.isError}
            helperText={
              definitionsCatalog.isLoading ? 'Loading available workflow types…' : 'Required'
            }
            SelectProps={{ native: true }}
            slotProps={{
              htmlInput: {
                'aria-label': 'Workflow type',
              },
            }}
          >
            <option value="">Select a workflow type</option>
            {definitionsCatalog.definitions.map((definition) => (
              <option key={definition.workflowType} value={definition.workflowType}>
                {`${definition.workflowType} (${definition.workflowVersion})`}
              </option>
            ))}
          </TextField>

          <TextField
            label="Input JSON"
            value={inputJson}
            onChange={(event) => {
              setInputJson(event.target.value);
              startWorkflow.clearState();
            }}
            multiline
            minRows={10}
            required
            autoFocus
            error={!inputState.valid}
            helperText={
              inputState.valid
                ? 'Required. Any syntactically valid JSON is accepted.'
                : inputState.error
            }
            slotProps={{
              input: {
                sx: {
                  fontFamily: 'monospace',
                },
              },
            }}
          />

          <TextField
            label="Idempotency key"
            value={idempotencyKey}
            onChange={(event) => {
              setIdempotencyKey(event.target.value);
              startWorkflow.clearState();
            }}
            helperText="Optional. Re-using the same key may return an existing run."
          />

          <TextField
            label="Metadata JSON"
            value={metadataJson}
            onChange={(event) => {
              setMetadataJson(event.target.value);
              startWorkflow.clearState();
            }}
            multiline
            minRows={5}
            error={!metadataState.valid}
            helperText={
              metadataState.valid
                ? 'Optional. Must be a JSON object when provided.'
                : metadataState.error
            }
            slotProps={{
              input: {
                sx: {
                  fontFamily: 'monospace',
                },
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {startWorkflow.state.isSubmitting ? 'Starting…' : 'Start workflow'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
