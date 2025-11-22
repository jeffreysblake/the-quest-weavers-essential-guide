# Claude Code Self-Improving Template - Quick Start

## 🚀 30-Second Setup

```bash
# Run the initialization script
./.claude/scripts/init-project.sh

# That's it! Start using Claude Code.
```

## 🎯 Essential Commands (Use These Daily)

```
/review          → Before marking ANY work complete
/test [file]     → After writing/modifying code
/consolidate     → When you notice similar code
/check-coverage  → To find untested code
```

## ⚡ Power Skills (Always Active)

These automatically prevent common mistakes:

- **persistence** → Stops "let me try a simpler approach" cop-outs
- **test-integrity** → Prevents fixing tests instead of code
- **build-verification** → Ensures builds before testing
- **proper-solutions** → No quick fixes, only production code

## 🎓 The Golden Rules

1. **Files max 600 lines** → Refactor when approaching limit
2. **All code needs tests** → No exceptions
3. **Consolidate before creating** → Search for existing solutions first
4. **Fix code, not tests** → Tests define correct behavior
5. **Build before test** → Always compile/build first
6. **No quick fixes** → Do it right the first time

## 🔥 Common Workflows

### Writing New Code
```
1. /research [what I'm building]  → Find existing patterns
2. Write tests first (TDD)
3. Implement code
4. /test [file] if more coverage needed
5. /review before done
```

### Fixing a Bug
```
1. Write failing test reproducing bug
2. Fix the code (NOT the test!)
3. Verify test passes
4. /review
```

### Refactoring
```
1. Ensure tests pass
2. Make small changes
3. Tests still pass?
4. Repeat
5. /consolidate to find more opportunities
```

### Starting Work
```
1. Check session output (auto-loads context)
2. /research to understand codebase
3. Plan approach
4. Execute with quality in mind
```

## 🚫 Red Flags (Never Say These)

**If Claude says:**
- "Let me try a simpler approach..." → WRONG! Skills will catch this
- "Here's a quick fix..." → NO! Do it properly
- "This is getting complex, so..." → Break it down, don't give up
- "Since we're out of time..." → There is no time limit!
- "This works for the main case..." → Handle ALL cases

**The skills will automatically prevent these patterns!**

## 🤖 When to Use Agents

Use specialized agents for complex tasks:

```
code-reviewer       → Deep multi-aspect review
test-generator      → Comprehensive test creation
refactor-specialist → Safe systematic refactoring
```

Claude will often invoke these automatically.

## 📊 Quick Quality Checks

**Before considering work done:**
```bash
# All must pass:
✓ npm test (or equivalent)
✓ npm run lint
✓ All files < 600 lines
✓ Coverage ≥ 80%
✓ No TODOs or FIXMEs
✓ No console.logs
```

## 💡 Pro Tips

**Maximize Effectiveness:**
- Let skills guide you—they prevent known pitfalls
- Use `/review` liberally—it's comprehensive
- Trust the automation—hooks catch issues early
- Customize CLAUDE.md for your project
- Add patterns you discover to memory

**Efficiency Tricks:**
- `/research` before building → finds existing solutions
- `/consolidate` regularly → prevents code bloat
- `/check-coverage` often → maintains quality
- Use agents for complex tasks → better results

## 🎪 Example Session

```
You: "Add a user authentication feature"

Claude: Let me start by researching existing auth patterns.
[Uses /research automatically via skills]

Found existing auth utilities in src/auth/. I'll extend those
rather than create new code.

[Plans implementation with TodoWrite]

Writing tests first...
[Creates test file]

Implementing auth feature...
[Uses existing patterns, follows conventions]

Running build and tests...
[Build-verification skill ensures this happens]

Tests pass. Running /review...
[Comprehensive quality check]

All quality checks pass. Feature complete!
```

## 🔧 Troubleshooting

**Skills seem to conflict?**
- They're working as designed—preventing shortcuts
- Follow their guidance for better code

**Hooks blocking operations?**
- Safety feature—review what's being blocked
- Override if truly necessary

**Want to customize?**
- Edit `.claude/CLAUDE.md` for project rules
- Add custom commands in `.claude/commands/`
- Modify skills in `.claude/skills/`

## 📈 Success Metrics

Track these over time:
- Test coverage trending up
- Files staying under 600 lines
- Zero linting errors
- Decreasing code duplication
- Fewer regressions

## 🎓 Learning Path

**Week 1:** Use basic commands (/review, /test)
**Week 2:** Leverage skills (let them guide you)
**Week 3:** Add custom commands for your workflow
**Week 4:** Customize skills and agents for your needs

## 🚀 Next Steps

1. Run `/init` to configure your project
2. Try `/research [your codebase]` to understand it
3. Use `/review` on existing code
4. Start using `/test` for new code
5. Notice how skills prevent mistakes
6. Enjoy production-quality code!

---

**Remember: This template makes Claude Code opinionated about quality. Let it guide you to better code.**

For full documentation, see [README.md](./.claude/README.md)
