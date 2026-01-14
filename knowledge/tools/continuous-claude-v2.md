---
title: "Continuous Claude v2"
type: tool
date_added: 2026-01-02
source: "https://github.com/parcadei/Continuous-Claude-v2"
tags: [claude-code, context-management, agents, mcp, state-persistence]
via: "Twitter bookmark from @parcadei"
---

Continuous Claude v2 is a Python framework that solves the context management and session continuity challenges in Claude Code workflows. It enables sophisticated multi-session workflows, agent orchestration, and efficient token management through persistent state, ledger-based tracking, and isolated context windows.

This tool is particularly valuable for developers building complex Claude Code applications that require maintaining state across sessions, coordinating multiple agents, and avoiding context pollution from MCP tool execution.

## Key Features

- **Session Continuity** - Maintain state via ledgers and handoffs across sessions
- **Ledger System** - Persistent state tracking with structured reasoning history
- **Handoff Protocol** - Resume work from previous sessions without context loss
- **MCP Execution Isolation** - Run MCP code without polluting main context
- **Agent Orchestration** - Coordinate multiple subagents with isolated context windows
- **Hooks System** - Lifecycle hooks at SessionStart, PreToolUse, PostToolUse, etc.
- **Token Efficiency** - Compact ledgers and smart context loading
- **Artifact Index** - Track artifacts and outcomes across sessions
- **Braintrust Integration** - Session tracing and compound learnings

## Architecture

The framework provides a complete session lifecycle:
1. **SessionStart** - Load ledger, load handoff, surface learnings
2. **Working** - PreToolUse preflight, PostToolUse processing, UserPrompt
3. **PreCompact** - Auto-handoff generation, manual block option
4. **SessionEnd** - Mark outcomes, cleanup, learn

## Key Concepts

- **Ledger** - Persistent continuity record with reasoning and outcomes
- **Handoff** - Resume context between sessions with artifact index
- **Skills** - Reusable operations (commit, create_handoff, resume_handoff)
- **Agents** - Autonomous subagents with isolated context windows
- **Hooks** - Extensibility points for custom session logic
- **Artifact Index** - SQLite+FTS5 for artifact search and outcome tracking

## Technical Details

- **Language:** Python
- **Repository:** github.com/parcadei/Continuous-Claude-v2
- **Stars:** 1400+
- **Use Cases:** Multi-session development, agent workflows, complex Claude Code projects

## Use Cases

- Building production Claude Code applications
- Multi-session feature development with state carryover
- Orchestrating multiple AI agents for complex tasks
- Research and experimentation workflows
- Token-efficient long-running agent systems

## Links

- [GitHub](https://github.com/parcadei/Continuous-Claude-v2)
- [Original Tweet](https://x.com/parcadei/status/2005755875701776624)
