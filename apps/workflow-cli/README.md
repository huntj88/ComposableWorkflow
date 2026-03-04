DATABASE_URL=postgresql://workflow:workflow@localhost:5432/workflow WORKFLOW_SERVER_PORT=3000 WORKFLOW_PACKAGE_SOURCES='[{"source":"path","value":"../workflow-package-reference"},{"source":"path","value":"../workflow-app-builder"}]' pnpm --filter @composable-workflow/workflow-server start

pnpm --filter @composable-workflow/workflow-cli run workflow run --type reference.long-running.v1 --input '{"requestId":"req_1","checkpointCount":3}'

pnpm --filter @composable-workflow/workflow-cli run workflow run --type reference.success.v1 --input '{"requestId":"req_1","customerId":"cust_1","amountCents":1000,"currency":"USD"}'

pnpm --filter @composable-workflow/workflow-cli run workflow run --type reference.parent-child.v1 --input '{"requestId":"req_1","childInput":{"requestId":"req_1","customerId":"cust_1","amountCents":1000,"currency":"USD"}}'

pnpm --filter @composable-workflow/workflow-cli run workflow inspect --type reference.long-running.v1 --graph

pnpm --filter @composable-workflow/workflow-cli run workflow runs list --workflow-type reference.long-running.v1

pnpm --filter @composable-workflow/workflow-cli run workflow runs list

pnpm --filter @composable-workflow/workflow-cli run workflow runs events --run-id wr_01KJ1YZFGQZHRGZBM99BRZWJ5A

pnpm --filter @composable-workflow/workflow-cli run workflow run --type app-builder.copilot.prompt.v1 --input "$(jq -n \
  --arg prompt "make a helloWorld.md file, say something that is not related to hello or worlds" \
  --arg cwd "/home/jameshunt/Projects/ComposableWorkflow/devEnv/workspace" \
  --arg schema "$(cat <<'SCHEMA'
{
"$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/status.schema.json",
"title": "Operation Status",
"type": "object",
"properties": {
"success": {
"description": "Indicates if the operation was completed successfully.",
"type": "boolean"
},
"message": {
"description": "A human-readable explanation of the result.",
"type": "string"
},
"timestamp": {
"type": "string",
"format": "date-time"
}
},
"required": ["success"]
}
SCHEMA
)" \
 '{prompt:$prompt, cwd:$cwd, allowedDirs:[$cwd], outputSchema:$schema}')"

pnpm --filter @composable-workflow/workflow-cli run workflow run \
 --type app-builder.spec-doc.v1 \
 --input '{
"request": "Build a react app that that communicates with workflow-server for workflow visualization of the finite state machines and children, associated metadata, realtime updates, observability, human responses, and other important features for interacting with the server",
"targetPath": "apps/workflow-web/docs/workflow-web-spec.md",
"constraints": [
"must be an SPA react app using vite",
"the changes for the app must be in apps/workflow-web directory"
],
"copilotPromptOptions": {
"cwd": "/home/jameshunt/Projects/ComposableWorkflow/apps/workflow-web",
"allowedDirs": [
"/home/jameshunt/Projects/ComposableWorkflow"
]
}
}'

pnpm --filter @composable-workflow/workflow-cli run workflow feedback respond \
 --feedback-run-id wr_01KJX03CX6J87G1V21GHMGJAMJ \
 --response '{"questionId":"completion-confirmation","selectedOptionIds":[2],"text":"This spec needs to have full implementation details so there is no ambiguity in system design or scope"}' \
 --responded-by user
