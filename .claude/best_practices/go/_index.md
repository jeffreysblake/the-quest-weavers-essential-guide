# Go Best Practices Index

## Available Templates (0)

*This directory is a placeholder for Go best practices.*

## Planned Templates

Community contributions welcome! Potential templates:

- `_quality-tools.md` - gofmt, golint, go vet, staticcheck
- `standard-lib.md` - Go standard library patterns
- `testing.md` - Go testing package patterns
- `gin.md` - Gin web framework
- `echo.md` - Echo web framework
- `gorm.md` - GORM ORM patterns
- `testify.md` - Testify assertion library

## Adding Templates

To contribute Go best practices:

1. Create template file (e.g., `gin.md`)
2. Add minimal frontmatter:
   ```yaml
   ---
   name: gin
   requires_deps: ["github.com/gin-gonic/gin"]
   ---
   ```
3. Write content with code examples
4. Create conditional in `.claude/conditionals/tech-stacks/go-gin.md`
5. Update this index

## Detection

Go projects are detected by:
- `go.mod`
- Dependencies listed in `go.mod`
