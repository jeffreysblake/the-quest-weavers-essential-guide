# /ratchet - Self-Improvement Analysis

Invokes the meta-optimizer agent to analyze workflow patterns, identify inefficiencies, and propose optimizations.

## What This Does

Runs a comprehensive review of:
- Learning memory (user corrections, common patterns, recurring issues)
- Agent effectiveness (which agents are used, which are ignored)
- Automation opportunities (tasks that could become skills)
- Recent workflow patterns
- Code quality trends

## When to Use

- **After completing a major feature**: Get optimization suggestions before next feature
- **Monthly reviews**: 1st of month for comprehensive analysis
- **When frustrated**: Something keeps going wrong? Let meta-optimizer find patterns
- **Workflow feels slow**: Identify bottlenecks and propose automation

## Output

Generates a detailed report with:
- Top 3-5 optimization proposals (prioritized by impact)
- Agent effectiveness analysis
- Skill creation recommendations
- Learning consolidation status
- ROI estimates for proposed changes

## Example Usage

```
User: /ratchet
Claude: [Invokes meta-optimizer agent]
        [Analyzes .claude/memory/learnings/]
        [Reviews recent git history and workflow]
        [Generates optimization report]

Output:
# Workflow Optimization Report - 2025-11-02

## Top Proposals
1. Create type-safety skill (saves 40 min/week, effort: 1 hour)
2. Add proactive file-size checking (prevents violations before they occur)
3. Consolidate common test pattern (occurred 3 times)

[Full detailed report...]
```

## Flags (Optional)

- **Quick mode**: `/ratchet quick` - Brief summary only (top 3 issues)
- **Full mode**: `/ratchet full` - Comprehensive report with all details (default)
- **Monthly**: `/ratchet monthly` - Run full monthly review checklist

## Related

- Learning memory: `.claude/memory/learnings/`
- Core memory: `.claude/memory/.claude-memory`
- Quick reference: `claude-quick-ref.md`
