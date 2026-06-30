// Notion API docs: https://developers.notion.com/reference/intro
// Internal integration guide: https://developers.notion.com/guides/get-started/internal-integrations

import { localHeaders } from "./client.ts";

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.log("Set NOTION_TOKEN to run this example.");
  process.exit(0);
}

await fetch("http://localhost:3000/api/connections/notion", {
  method: "PUT",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "api_key", values: { apiKey: token } }),
});

const response = await fetch("http://localhost:3000/api/actions/notion.search/runs", {
  method: "POST",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: { page_size: 5 } }),
});

console.log(JSON.stringify(await response.json(), null, 2));
