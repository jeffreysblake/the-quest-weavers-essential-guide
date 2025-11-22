# Claude Code Self-Improving Template

A comprehensive, self-learning Claude Code setup that enforces best practices, prevents common pitfalls, and ensures production-quality code.

## 🎯 Philosophy

This template is built on key principles:

- **No Quick Fixes**: Always do it right the first time
- **Tests Are Mandatory**: All code must have tests
- **Consolidate Over Create**: Reuse before writing new code
- **Files Stay Small**: 600 lines maximum
- **Never Give Up**: Persistence over shortcuts
- **Quality First**: Production-ready from the start

## 📁 Structure

```
.claude/
├── CLAUDE.md                    # Core memory and principles
├── README.md                    # This file
├── commands/                    # Slash commands
│   ├── review.md               # Comprehensive code review
│   ├── test.md                 # Test generation
│   ├── consolidate.md          # Find and merge duplicates
│   ├── check-coverage.md       # Coverage analysis
│   ├── optimize.md             # Performance review
│   ├── research.md             # Codebase exploration
│   └── init.md                 # Project initialization
├── skills/                      # Model-invoked skills
│   ├── persistence/            # Anti-defeatist patterns
│   ├── test-integrity/         # Ensure test correctness
│   ├── build-verification/     # Always build before test
│   └── proper-solutions/       # No quick fixes
├── agents/                      # Specialized sub-agents
│   ├── code-reviewer.md        # Deep code analysis
│   ├── test-generator.md       # Comprehensive test creation
│   └── refactor-specialist.md  # Safe refactoring
├── hooks/                       # Automation hooks
│   ├── session-start.sh        # Initialize session
│   ├── post-edit-quality.sh    # Quality checks
│   └── pre-bash-safety.sh      # Prevent dangerous ops
└── scripts/                     # Helper scripts
    └── init-project.sh         # Project setup
```

## 🚀 Quick Start

### For New Projects

```bash
# Initialize with the template
./.claude/scripts/init-project.sh

# Claude will automatically:
# - Detect your project type
# - Set up quality checks
# - Configure commands and skills
# - Analyze current state
```

### For Existing Projects

1. Copy `.claude/` directory to your project
2. Run `/init` to configure for your project
3. Review and customize `.claude/CLAUDE.md`
4. Start using slash commands and skills

## 📋 Available Commands

Use these slash commands in your Claude Code sessions:

### `/review`
Comprehensive code review checklist:
- Code quality and maintainability
- Test coverage
- Security vulnerabilities
- Performance issues
- Architecture compliance

### `/test [target]`
Generate comprehensive tests:
- Happy path scenarios
- Edge cases
- Error conditions
- Integration tests

### `/consolidate [target]`
Find and merge duplicate code:
- Identifies similar patterns
- Suggests consolidation
- Implements safely
- Maintains test coverage

### `/check-coverage [target]`
Analyze test coverage:
- Identifies gaps
- Prioritizes critical paths
- Suggests test cases
- Tracks improvements

### `/optimize [target]`
Performance review:
- Algorithmic complexity
- Resource usage
- Bottleneck identification
- Optimization suggestions

### `/research [question]`
Explore codebase:
- Find patterns
- Understand architecture
- Discover conventions
- Learn project structure

### `/init [type]`
Initialize project:
- Detect project type
- Configure tooling
- Analyze current state
- Provide recommendations

## 🤖 Specialized Agents

Invoke these for complex tasks:

### `code-reviewer`
Deep, multi-aspect code analysis:
- Quality, security, performance
- Architecture review
- Best practices validation
- Detailed feedback

**Usage:** Claude will invoke automatically for complex reviews, or manually trigger via the Task tool.

### `test-generator`
Comprehensive test creation:
- All code paths covered
- Edge cases included
- Following TDD principles
- Maintainable tests

**Usage:** Use when generating tests for complex code.

### `refactor-specialist`
Safe, systematic refactoring:
- Small, incremental steps
- Tests stay green
- Behavior preserved
- Quality improved

**Usage:** For any refactoring work.

## ⚡ Active Skills

These skills are always active and guide Claude's behavior:

### `persistence`
**Prevents:**
- "Let me try a simpler approach..."
- "Since we're out of time..."
- "Here's a quick fix..."
- Giving up too early
- Suggesting workarounds

**Ensures:**
- Complete solutions
- Proper implementation
- No shortcuts
- Full task completion

### `test-integrity`
**Prevents:**
- Modifying tests to match bugs
- Weakening test assertions
- Skipping test failures
- Justifying wrong behavior

**Ensures:**
- Tests define correct behavior
- Fix code, not tests
- Comprehensive coverage
- Test quality

### `build-verification`
**Prevents:**
- Running tests without building
- Forgetting compilation
- Skipping dependency installation
- Testing stale code

**Ensures:**
- Always build before test
- Dependencies installed
- Fresh builds
- No compilation amnesia

### `proper-solutions`
**Prevents:**
- Quick fixes
- Temporary workarounds
- Partial implementations
- Deferred quality

**Ensures:**
- Production-ready code
- Complete implementations
- No technical debt
- Quality from the start

## 🔧 Automation Hooks

These hooks run automatically:

### SessionStart
**When:** Every session starts
**Does:**
- Loads git context
- Checks test status
- Identifies linting issues
- Provides session context

### PostToolUse (Edit/Write)
**When:** After editing/writing files
**Does:**
- Checks file size (600 line limit)
- Runs linters
- Identifies quality issues
- Warns about problems

### PreToolUse (Bash)
**When:** Before running bash commands
**Does:**
- Prevents dangerous operations
- Warns about risky commands
- Protects critical files
- Ensures safety

## 🎓 Core Principles

### Code Quality

**File Size:** Max 600 lines per file
- Refactor before exceeding limit
- Extract modules when needed
- Keep files focused

**Testing:** Mandatory for all code
- New code requires tests
- Modified code updates tests
- 80% minimum coverage
- Tests before code (TDD)

**No Duplication:** Consolidate before creating
- Search for existing patterns
- Reuse existing code
- Extract shared utilities
- DRY principle

**Documentation:** Update, don't create
- Inline documentation preferred
- Update existing docs
- Explain complex logic
- Architecture decisions

### Workflow

**Before Starting:**
1. Read existing code
2. Check for similar patterns
3. Plan approach
4. Verify understanding

**During Implementation:**
1. Write tests first
2. Implement incrementally
3. Run linters continuously
4. Refactor as needed

**After Implementation:**
1. All tests pass
2. Linting clean
3. Coverage verified
4. Documentation updated

## 🔍 Common Patterns

### Good Patterns ✅

- Small, focused functions
- Comprehensive error handling
- Descriptive names
- Consistent style
- Tests documenting behavior
- Explanatory comments

### Anti-Patterns ❌

- Creating files vs. extending
- Writing new vs. consolidating
- Skipping tests
- Ignoring linters
- Copy-pasting code
- Magic numbers

## 📈 Self-Improvement

This template learns and adapts:

### Pattern Recognition
- Identifies recurring issues
- Extracts common solutions
- Documents learnings
- Updates guidelines

### Continuous Improvement
- Regular CLAUDE.md updates
- New patterns added
- Anti-patterns documented
- Tool effectiveness tracking

### Memory System
- Project-specific learnings
- Architecture decisions
- Technical debt tracking
- Improvement opportunities

## 🛠️ Customization

### Adding Custom Commands

Create `.claude/commands/your-command.md`:
```markdown
---
description: Your command description
---

# Command content here
Use $ARGUMENTS for parameters
Use @file.js to reference files
```

### Adding Custom Skills

Create `.claude/skills/your-skill/SKILL.md`:
```markdown
---
name: your-skill
description: When to use this skill
---

# Skill instructions here
```

### Adding Custom Agents

Create `.claude/agents/your-agent.md`:
```markdown
---
name: your-agent
description: What this agent does
model: sonnet
tools: [Read, Write, Edit]
---

# Agent instructions here
```

### Configuring Hooks

Edit hook scripts in `.claude/hooks/`:
- Make them executable: `chmod +x hook.sh`
- Return proper JSON format
- Exit with correct codes

## 📊 Metrics & Tracking

Track improvements:
- Test coverage over time
- File size trends
- Code duplication reduction
- Linting issue frequency
- Bug regression rate

## 🚦 Best Practices

### Do:
- ✅ Use slash commands proactively
- ✅ Let skills guide behavior
- ✅ Invoke agents for complex tasks
- ✅ Trust the automation
- ✅ Customize to your needs
- ✅ Update CLAUDE.md regularly

### Don't:
- ❌ Skip quality checks
- ❌ Ignore skill guidance
- ❌ Bypass hooks
- ❌ Make quick fixes
- ❌ Defer testing
- ❌ Ignore linting

## 🤝 Contributing

To improve this template:

1. Document new patterns
2. Add helpful commands
3. Create useful skills
4. Share learnings
5. Update documentation

## 📚 Resources

- [Claude Code Docs](https://code.claude.com/docs)
- [Skills Guide](https://code.claude.com/docs/en/skills.md)
- [Slash Commands](https://code.claude.com/docs/en/slash-commands.md)
- [Hooks Guide](https://code.claude.com/docs/en/hooks-guide.md)

## 🎉 Success Criteria

You'll know this template is working when:

- ✅ All files stay under 600 lines
- ✅ Test coverage stays above 80%
- ✅ Linting always passes
- ✅ No code duplication
- ✅ Claude never suggests "quick fixes"
- ✅ All code is production-ready
- ✅ Quality improves over time

## 💡 Tips

**For Best Results:**
- Start each session with `/review`
- Use `/research` before implementing
- Run `/test` for all new code
- Invoke `/consolidate` regularly
- Check `/check-coverage` frequently
- Trust the skills—they prevent common mistakes

**Remember:**
- Persistence beats cleverness
- Quality beats speed
- Proper solutions beat quick fixes
- Tests are not optional
- Documentation prevents questions
- Consolidation prevents bloat

---

**This template ensures Claude Code produces production-ready, maintainable code every time. No shortcuts, no compromises, no quick fixes—just quality software.**
