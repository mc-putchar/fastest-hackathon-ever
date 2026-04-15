# Harbor Hackathon Prototype

Calm operator for high-friction digital errands, starting with Berlin Burgeramt booking.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Server-side planner model:

```bash
OPENAI_API_KEY=...
OPENAI_PLANNER_MODEL=gpt-5.4-mini
OPENAI_PLANNER_REASONING_EFFORT=low
```

Tracing and demo executor:

```bash
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
APP_BASE_URL=http://127.0.0.1:3000
```

## Architecture

- Planner: OpenAI Responses API returns structured intake data, task classification, and field extraction.
- Executor: Playwright adapters own browser reachability, slot search, evidence capture, and approval-gated submission.
- Safety boundary: the planner never clicks through public sites; the executor never decides user intent.

## Current Workflow

- Fully shaped path: Burgeramt appointment booking
- Controlled happy path: `/demo/burgeramt`
- Live path: reachability probe only, intentionally blocked before brittle public-site submission
