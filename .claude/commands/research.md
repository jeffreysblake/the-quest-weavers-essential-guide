---
description: Explore codebase patterns, architecture, and conventions
---

# Codebase Research

Thoroughly explore and understand the codebase to answer: $ARGUMENTS

## Research Process

### 1. Understand the Question
- Clarify what information is needed
- Identify relevant areas of the codebase
- Determine scope of research

### 2. Explore Architecture
- Identify project structure and organization
- Locate key directories and files
- Understand module boundaries
- Map dependencies and relationships

### 3. Find Patterns
Search for:
- Similar implementations or patterns
- Existing utilities and helpers
- Naming conventions
- Code organization patterns
- Testing approaches
- Error handling strategies
- State management patterns
- API interaction patterns

### 4. Analyze Examples
- Find representative examples of the pattern
- Study how it's implemented
- Understand why it's done that way
- Note variations and edge cases
- Identify best practices used

### 5. Document Findings
Create a clear summary including:
- What patterns exist
- Where they're implemented (file:line references)
- How to use them
- When to use them
- Examples of usage
- Any gotchas or caveats

## Research Techniques

**File Exploration**
- Use Glob to find files by pattern
- Use Grep to search for code patterns
- Read key files to understand implementation
- Check related tests for usage examples

**Pattern Discovery**
- Search for similar function names
- Look for common imports
- Find similar component structures
- Identify shared utilities

**Context Building**
- Read configuration files
- Check package.json for dependencies
- Review build and test setup
- Understand project conventions

## Output Format

```
Question: [Original research question]

Findings:
1. [Primary pattern or approach]
   Location: path/to/file.js:123
   Description: [How it works]
   Usage: [How to use it]
   Example: [Code example]

2. [Alternative pattern or approach]
   Location: path/to/other.js:456
   Description: [How it works]
   Comparison: [When to use this vs #1]

Related Patterns:
- [Related pattern 1] - path/to/file.js:789
- [Related pattern 2] - path/to/another.js:012

Recommendations:
- [Suggested approach based on findings]
- [Best practices to follow]
- [Things to avoid]

References:
- path/to/example1.js:123 - [Description]
- path/to/example2.js:456 - [Description]
```

## Common Research Questions

**Architecture**
- How is the project structured?
- What's the data flow?
- How are modules organized?
- What design patterns are used?

**Implementation**
- How is [feature] implemented?
- Where is [functionality] located?
- What patterns are used for [task]?
- How should I implement [new feature]?

**Conventions**
- What naming conventions are used?
- How are errors handled?
- What testing patterns are followed?
- How is state managed?

**Dependencies**
- What libraries are used for [purpose]?
- How are external APIs consumed?
- What utilities are available?
- How are types/interfaces organized?

After research:
- Share findings clearly with references
- Suggest best approach based on existing patterns
- Note any improvements to existing patterns
- Update CLAUDE.md if new patterns discovered
