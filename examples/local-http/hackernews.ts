// Hacker News API docs: https://github.com/HackerNews/API

import { localHeaders } from "./client.ts";

const response = await fetch("http://localhost:3000/api/actions/hackernews.get_top_stories/runs", {
  method: "POST",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: {} }),
});

console.log(JSON.stringify(await response.json(), null, 2));
