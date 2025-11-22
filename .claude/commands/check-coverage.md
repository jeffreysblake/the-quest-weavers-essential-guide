---
description: Verify test coverage metrics and identify gaps
---

# Test Coverage Check

Analyze test coverage and identify areas needing more tests.

## Target
$ARGUMENTS (or entire project if not specified)

## Analysis Steps

### 1. Run Coverage Report
- Execute the project's coverage command
- Generate detailed coverage report
- Identify coverage metrics (line, branch, function, statement)

### 2. Analyze Coverage Gaps
Look for:
- **Uncovered Lines**: Specific lines without test execution
- **Uncovered Branches**: Conditional paths not tested
- **Uncovered Functions**: Functions never called in tests
- **Low Coverage Files**: Files below 80% coverage threshold

### 3. Prioritize Gaps
Focus on:
- Critical business logic (highest priority)
- Error handling paths
- Edge cases and boundary conditions
- Recently modified code
- Complex algorithms or calculations

### 4. Generate Test Recommendations
For each significant gap:
- Identify the untested code
- Explain what scenarios are missing
- Suggest specific test cases to add
- Estimate test complexity and effort

### 5. Create Missing Tests
- Write tests for critical gaps
- Follow the project's testing patterns
- Co-locate tests with implementation
- Verify new tests actually improve coverage

## Coverage Targets

**Minimum Requirements**
- Overall coverage: 80%
- Critical paths: 100%
- New/modified code: 80%
- Utility functions: 90%

**Coverage Types**
- Line coverage: Code lines executed
- Branch coverage: All conditional paths taken
- Function coverage: All functions called
- Statement coverage: All statements executed

## Output Format

```
Coverage Summary:
- Overall: XX%
- Lines: XX%
- Branches: XX%
- Functions: XX%
- Statements: XX%

Files Below Threshold:
1. path/to/file.js - XX% coverage
   - Missing: [specific uncovered areas]
   - Recommended tests: [test scenarios]

2. path/to/another.js - XX% coverage
   - Missing: [specific uncovered areas]
   - Recommended tests: [test scenarios]

Critical Gaps:
- [Description of critical untested code]
- [Suggested test cases]

Action Items:
- [ ] Add tests for [specific area]
- [ ] Cover edge case in [function]
- [ ] Test error handling in [module]
```

## Follow-up Actions

After analyzing coverage:
1. Create tests for critical gaps
2. Run coverage again to verify improvement
3. Update test suite to maintain coverage
4. Add coverage checks to CI/CD if not present
