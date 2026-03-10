import { describe, expect, it } from 'vitest';

import {
  TEMPLATE_IDS,
  PROMPT_TEMPLATES,
  type PromptTemplateId,
  type PromptTemplate,
  getPromptTemplate,
  getAllTemplateIds,
  interpolate,
} from '../../../src/workflows/spec-doc/prompt-templates.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// SD-Prompt-001: VersionedTemplateCatalog
// ---------------------------------------------------------------------------

describe('TEMPLATE_IDS', () => {
  it('contains the required core and scoped consistency template IDs', () => {
    expect(TEMPLATE_IDS.integrate).toBe('spec-doc.integrate.v1');
    expect(TEMPLATE_IDS.consistencyScopeObjective).toBe('spec-doc.consistency-scope-objective.v1');
    expect(TEMPLATE_IDS.consistencyNonGoals).toBe('spec-doc.consistency-non-goals.v1');
    expect(TEMPLATE_IDS.consistencyConstraintsAssumptions).toBe(
      'spec-doc.consistency-constraints-assumptions.v1',
    );
    expect(TEMPLATE_IDS.consistencyInterfacesContracts).toBe(
      'spec-doc.consistency-interfaces-contracts.v1',
    );
    expect(TEMPLATE_IDS.consistencyAcceptanceCriteria).toBe(
      'spec-doc.consistency-acceptance-criteria.v1',
    );
    expect(TEMPLATE_IDS.consistencyContradictionsCompleteness).toBe(
      'spec-doc.consistency-contradictions-completeness.v1',
    );
    expect(TEMPLATE_IDS.consistencyResolution).toBe('spec-doc.consistency-resolution.v1');
    expect(TEMPLATE_IDS.classifyCustomPrompt).toBe('spec-doc.classify-custom-prompt.v1');
    expect(TEMPLATE_IDS.expandClarification).toBe('spec-doc.expand-clarification.v1');
  });

  it('has exactly ten entries', () => {
    expect(Object.keys(TEMPLATE_IDS)).toHaveLength(10);
  });
});

describe('getAllTemplateIds', () => {
  it('returns all template IDs including the scoped consistency layers', () => {
    const ids = getAllTemplateIds();
    expect(ids).toHaveLength(10);
    expect(ids).toContain(TEMPLATE_IDS.integrate);
    expect(ids).toContain(TEMPLATE_IDS.consistencyScopeObjective);
    expect(ids).toContain(TEMPLATE_IDS.consistencyNonGoals);
    expect(ids).toContain(TEMPLATE_IDS.consistencyConstraintsAssumptions);
    expect(ids).toContain(TEMPLATE_IDS.consistencyInterfacesContracts);
    expect(ids).toContain(TEMPLATE_IDS.consistencyAcceptanceCriteria);
    expect(ids).toContain(TEMPLATE_IDS.consistencyContradictionsCompleteness);
    expect(ids).toContain(TEMPLATE_IDS.consistencyResolution);
    expect(ids).toContain(TEMPLATE_IDS.classifyCustomPrompt);
    expect(ids).toContain(TEMPLATE_IDS.expandClarification);
  });
});

// ---------------------------------------------------------------------------
// PROMPT_TEMPLATES catalog
// ---------------------------------------------------------------------------

describe('PROMPT_TEMPLATES', () => {
  it('has a template entry for every TEMPLATE_ID', () => {
    for (const id of getAllTemplateIds()) {
      expect(PROMPT_TEMPLATES[id]).toBeDefined();
      expect(PROMPT_TEMPLATES[id].id).toBe(id);
    }
  });

  describe('spec-doc.integrate.v1', () => {
    const tpl: PromptTemplate = PROMPT_TEMPLATES[TEMPLATE_IDS.integrate];

    it('has the correct template ID', () => {
      expect(tpl.id).toBe('spec-doc.integrate.v1');
    });

    it('maps outputSchemaId to specIntegrationOutput', () => {
      expect(tpl.outputSchemaId).toBe(SCHEMA_IDS.specIntegrationOutput);
    });

    it('maps inputSchemaId to specIntegrationInput (IntegrateIntoSpec requires input schema)', () => {
      expect(tpl.inputSchemaId).toBe(SCHEMA_IDS.specIntegrationInput);
    });

    it('declares all required interpolation variables', () => {
      expect(tpl.requiredVars).toContain('request');
      expect(tpl.requiredVars).toContain('targetPath');
      expect(tpl.requiredVars).toContain('constraintsJson');
      expect(tpl.requiredVars).toContain('specPath');
      expect(tpl.requiredVars).toContain('answersJson');
      expect(tpl.requiredVars).toContain('actionableItemsJson');
      expect(tpl.requiredVars).not.toContain('source');
    });

    it('body contains key spec 7.2.1 phrases', () => {
      expect(tpl.body).toContain('implementation-ready software specification markdown document');
      expect(tpl.body).toContain('{{request}}');
      expect(tpl.body).toContain('{{constraintsJson}}');
      expect(tpl.body).toContain('{{answersJson}}');
      expect(tpl.body).toContain('{{actionableItemsJson}}');
      expect(tpl.body).not.toContain('{{source}}');
    });
  });

  describe('scoped consistency templates', () => {
    const scopedTemplateIds = [
      TEMPLATE_IDS.consistencyScopeObjective,
      TEMPLATE_IDS.consistencyNonGoals,
      TEMPLATE_IDS.consistencyConstraintsAssumptions,
      TEMPLATE_IDS.consistencyInterfacesContracts,
      TEMPLATE_IDS.consistencyAcceptanceCriteria,
      TEMPLATE_IDS.consistencyContradictionsCompleteness,
    ] as const;

    it('all map to their matching narrow stage schemas and use shared interpolation variables', () => {
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyScopeObjective].outputSchemaId).toBe(
        SCHEMA_IDS.consistencyScopeObjectiveOutput,
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyNonGoals].outputSchemaId).toBe(
        SCHEMA_IDS.consistencyNonGoalsOutput,
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyConstraintsAssumptions].outputSchemaId).toBe(
        SCHEMA_IDS.consistencyConstraintsAssumptionsOutput,
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyInterfacesContracts].outputSchemaId).toBe(
        SCHEMA_IDS.consistencyInterfacesContractsOutput,
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyAcceptanceCriteria].outputSchemaId).toBe(
        SCHEMA_IDS.consistencyAcceptanceCriteriaOutput,
      );
      expect(
        PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyContradictionsCompleteness].outputSchemaId,
      ).toBe(SCHEMA_IDS.consistencyContradictionsCompletenessOutput);

      for (const templateId of scopedTemplateIds) {
        const tpl = PROMPT_TEMPLATES[templateId];
        expect(tpl.inputSchemaId).toBeUndefined();
        expect(tpl.requiredVars).toEqual([
          'request',
          'specPath',
          'constraintsJson',
          'loopCount',
          'remainingQuestionIdsJson',
          'stageId',
        ]);
      }
    });

    it('narrow the validation scope for each stage', () => {
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyScopeObjective].body).toContain(
        'scope and objective clarity',
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyNonGoals].body).toContain(
        'non-goals and exclusions',
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyConstraintsAssumptions].body).toContain(
        'constraints and assumptions',
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyInterfacesContracts].body).toContain(
        'interfaces and contracts',
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyAcceptanceCriteria].body).toContain(
        'acceptance criteria and testability',
      );
      expect(PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyContradictionsCompleteness].body).toContain(
        'contradictions and implementation completeness',
      );
    });
  });

  describe('spec-doc.consistency-resolution.v1', () => {
    const tpl: PromptTemplate = PROMPT_TEMPLATES[TEMPLATE_IDS.consistencyResolution];

    it('maps to the aggregate consistency schema', () => {
      expect(tpl.outputSchemaId).toBe(SCHEMA_IDS.consistencyCheckOutput);
      expect(tpl.inputSchemaId).toBeUndefined();
    });

    it('declares the deterministic planning input variables', () => {
      expect(tpl.requiredVars).toEqual([
        'request',
        'specPath',
        'constraintsJson',
        'loopCount',
        'remainingQuestionIdsJson',
        'coverageSummaryJson',
      ]);
    });

    it('documents full-sweep consolidation behavior', () => {
      expect(tpl.body).toContain('full consistency-check coverage sweep');
      expect(tpl.body).toContain('{{coverageSummaryJson}}');
      expect(tpl.body).toContain('It is valid for the final aggregate to include both non-empty');
    });
  });

  describe('spec-doc.classify-custom-prompt.v1', () => {
    const tpl: PromptTemplate = PROMPT_TEMPLATES[TEMPLATE_IDS.classifyCustomPrompt];

    it('has the correct template ID', () => {
      expect(tpl.id).toBe('spec-doc.classify-custom-prompt.v1');
    });

    it('maps outputSchemaId to customPromptClassificationOutput', () => {
      expect(tpl.outputSchemaId).toBe(SCHEMA_IDS.customPromptClassificationOutput);
    });

    it('has no inputSchemaId', () => {
      expect(tpl.inputSchemaId).toBeUndefined();
    });

    it('declares all required interpolation variables', () => {
      expect(tpl.requiredVars).toContain('questionId');
      expect(tpl.requiredVars).toContain('questionPrompt');
      expect(tpl.requiredVars).toContain('selectedOptionIdsJson');
      expect(tpl.requiredVars).toContain('customText');
    });

    it('body contains key spec 7.2.3 phrases', () => {
      expect(tpl.body).toContain("Classify the user's custom text");
      expect(tpl.body).toContain('{{customText}}');
      expect(tpl.body).toContain('clarifying-question');
      expect(tpl.body).toContain('unrelated-question');
      expect(tpl.body).toContain('custom-answer');
      expect(tpl.body).toContain('still count as clarifying-question');
      expect(tpl.body).toContain('Use unrelated-question only for side research');
    });
  });

  describe('spec-doc.expand-clarification.v1', () => {
    const tpl: PromptTemplate = PROMPT_TEMPLATES[TEMPLATE_IDS.expandClarification];

    it('has the correct template ID', () => {
      expect(tpl.id).toBe('spec-doc.expand-clarification.v1');
    });

    it('maps outputSchemaId to clarificationFollowUpOutput', () => {
      expect(tpl.outputSchemaId).toBe(SCHEMA_IDS.clarificationFollowUpOutput);
    });

    it('has no inputSchemaId', () => {
      expect(tpl.inputSchemaId).toBeUndefined();
    });

    it('declares all required interpolation variables', () => {
      expect(tpl.requiredVars).toContain('request');
      expect(tpl.requiredVars).toContain('specPath');
      expect(tpl.requiredVars).toContain('sourceQuestionId');
      expect(tpl.requiredVars).toContain('sourceQuestionPrompt');
      expect(tpl.requiredVars).toContain('sourceOptionsJson');
      expect(tpl.requiredVars).toContain('customQuestionText');
      expect(tpl.requiredVars).toContain('intent');
    });

    it('body contains key spec 7.2.4 phrases', () => {
      expect(tpl.body).toContain("Research the user's question");
      expect(tpl.body).toContain('{{sourceQuestionId}}');
      expect(tpl.body).toContain('{{customQuestionText}}');
      expect(tpl.body).toContain('researchOutcome');
    });
  });
});

// ---------------------------------------------------------------------------
// getPromptTemplate
// ---------------------------------------------------------------------------

describe('getPromptTemplate', () => {
  it('returns the correct template for a known ID', () => {
    const tpl = getPromptTemplate(TEMPLATE_IDS.integrate);
    expect(tpl.id).toBe(TEMPLATE_IDS.integrate);
    expect(tpl.outputSchemaId).toBe(SCHEMA_IDS.specIntegrationOutput);
  });

  it('throws for unknown template ID', () => {
    expect(() => getPromptTemplate('not-a-real-template' as PromptTemplateId)).toThrow(
      'Unknown prompt template ID',
    );
  });
});

// ---------------------------------------------------------------------------
// interpolate
// ---------------------------------------------------------------------------

describe('interpolate', () => {
  it('replaces known placeholders with variable values', () => {
    const result = interpolate('Hello {{name}}, your id is {{id}}.', {
      name: 'World',
      id: '42',
    });
    expect(result).toBe('Hello World, your id is 42.');
  });

  it('leaves unknown placeholders intact', () => {
    const result = interpolate('{{known}} and {{unknown}}', { known: 'yes' });
    expect(result).toBe('yes and {{unknown}}');
  });

  it('handles empty variables object', () => {
    const result = interpolate('{{a}} {{b}}', {});
    expect(result).toBe('{{a}} {{b}}');
  });

  it('handles template text with no placeholders', () => {
    const result = interpolate('No placeholders here.', { ignored: 'value' });
    expect(result).toBe('No placeholders here.');
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const result = interpolate('{{x}} and {{x}}', { x: 'val' });
    expect(result).toBe('val and val');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: every template has output schema from SCHEMA_IDS
// ---------------------------------------------------------------------------

describe('schema alignment', () => {
  const schemaIdValues = new Set(Object.values(SCHEMA_IDS));

  it('every template outputSchemaId references a known SCHEMA_IDS entry', () => {
    for (const tpl of Object.values(PROMPT_TEMPLATES)) {
      expect(schemaIdValues.has(tpl.outputSchemaId)).toBe(true);
    }
  });

  it('every template inputSchemaId (when present) references a known SCHEMA_IDS entry', () => {
    for (const tpl of Object.values(PROMPT_TEMPLATES)) {
      if (tpl.inputSchemaId) {
        expect(schemaIdValues.has(tpl.inputSchemaId)).toBe(true);
      }
    }
  });
});
