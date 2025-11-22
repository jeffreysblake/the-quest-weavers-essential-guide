# Java Best Practices Index

## Available Templates (0)

*This directory is a placeholder for Java/Spring Boot best practices.*

## Planned Templates

Community contributions welcome! Potential templates:

- `_quality-tools.md` - Maven/Gradle, Checkstyle, SpotBugs, JUnit
- `spring-boot.md` - Spring Boot framework patterns
- `junit.md` - JUnit 5 testing patterns
- `spring-data.md` - Spring Data JPA patterns
- `spring-security.md` - Spring Security patterns
- `lombok.md` - Lombok usage patterns
- `hibernate.md` - Hibernate ORM patterns

## Adding Templates

To contribute Java best practices:

1. Create template file (e.g., `spring-boot.md`)
2. Add minimal frontmatter:
   ```yaml
   ---
   name: spring-boot
   requires_deps: ["spring-boot-starter"]
   ---
   ```
3. Write content with code examples
4. Create conditional in `.claude/conditionals/tech-stacks/java-spring.md`
5. Update this index

## Detection

Java projects are detected by:
- `pom.xml` (Maven)
- `build.gradle` or `build.gradle.kts` (Gradle)
- Dependencies in those files
