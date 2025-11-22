---
description: Performance and efficiency review of code
---

# Code Optimization Review

Analyze code for performance improvements and efficiency gains.

## Target
$ARGUMENTS (or recent changes if not specified)

## Analysis Areas

### 1. Algorithmic Complexity
- Identify O(n²) or higher complexity algorithms
- Look for unnecessary nested loops
- Find opportunities for memoization/caching
- Check for redundant calculations
- Analyze recursive functions for tail-call optimization

### 2. Data Structure Usage
- Verify appropriate data structure choices
- Look for inefficient lookups (array.find in loops)
- Check for unnecessary data copying
- Identify opportunities for Set/Map over Array/Object
- Analyze memory usage patterns

### 3. Resource Management
- Check for proper cleanup (event listeners, timers, connections)
- Identify memory leaks (closures, detached DOM, circular refs)
- Verify file handles and streams are closed
- Check database connection pooling
- Analyze caching strategies

### 4. Network & I/O
- Look for unnecessary API calls
- Identify opportunities for batching requests
- Check for proper pagination
- Verify efficient data serialization
- Analyze bundle size and code splitting

### 5. Rendering & Updates
- Check for unnecessary re-renders (React, Vue, etc.)
- Identify expensive computations in render paths
- Verify proper use of useMemo/useCallback/computed
- Analyze component update triggers
- Check for layout thrashing

### 6. Code Efficiency
- Find duplicate work in loops
- Identify unnecessary object creation
- Check for premature optimization
- Verify lazy loading where appropriate
- Analyze startup/initialization time

## Performance Patterns to Check

**Common Anti-Patterns**
- [ ] Nested loops over large datasets
- [ ] Array.find/filter inside loops
- [ ] Creating functions in render/update cycles
- [ ] Unnecessary deep cloning
- [ ] Missing debounce/throttle on frequent events
- [ ] Synchronous operations blocking the main thread
- [ ] Loading all data upfront instead of lazy loading
- [ ] No caching of expensive computations

**Good Patterns**
- [ ] Early returns to avoid unnecessary work
- [ ] Appropriate use of indices/maps for lookups
- [ ] Memoization of expensive pure functions
- [ ] Batch operations where possible
- [ ] Lazy initialization of resources
- [ ] Proper use of async/await and promises
- [ ] Strategic code splitting and lazy loading

## Optimization Guidelines

**When to Optimize**
- Measure first - identify actual bottlenecks
- Focus on hot paths (frequently executed code)
- Prioritize user-facing performance
- Consider developer experience trade-offs

**When NOT to Optimize**
- Premature optimization in non-critical paths
- If it significantly reduces code readability
- For micro-optimizations with negligible impact
- If it introduces bugs or complexity

## Output Format

For each optimization opportunity:

```
1. Location: path/to/file.js:123
   Issue: [Description of performance concern]
   Impact: [High/Medium/Low] - [Explanation]
   Current Complexity: O(n²)
   Proposed Solution: [Specific optimization]
   Expected Improvement: [Estimated gain]
   Trade-offs: [Any downsides to consider]
```

## Implementation Priority

**High Priority** (Implement immediately)
- Obvious algorithmic improvements (O(n²) → O(n))
- Memory leaks
- Blocking operations on critical paths
- Severe resource waste

**Medium Priority** (Consider implementing)
- Caching opportunities with clear benefit
- Unnecessary re-renders or updates
- Bundle size optimizations
- Network request batching

**Low Priority** (Nice to have)
- Minor micro-optimizations
- Edge case performance
- Theoretical improvements without measured impact

After identifying optimizations:
1. Measure current performance (baseline)
2. Implement optimization
3. Verify tests still pass
4. Measure new performance (confirm improvement)
5. Ensure no regression in other areas
