```markdown
# CityExpress-backendG15 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill documents the development patterns and conventions used in the CityExpress-backendG15 repository. The codebase is written in TypeScript and follows consistent coding and commit conventions to ensure maintainability and clarity. While no specific framework is detected, the repository employs structured file naming, import/export styles, and conventional commit messages. This guide will help you contribute effectively to the project.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userController.ts`, `bookingService.ts`

### Import Style
- Use **alias imports** for modules.
  - Example:
    ```typescript
    import { UserService } from '@services/userService';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // In userService.ts
    export function createUser(data: UserData) { ... }
    ```

### Commit Messages
- Follow the **Conventional Commits** specification.
- Use the `feat` prefix for new features.
- Commit messages are concise (average 59 characters).
  - Example:
    ```
    feat: add user authentication middleware
    ```

## Workflows

### Feature Development
**Trigger:** When implementing a new feature  
**Command:** `/feature-development`

1. Create a new branch for your feature.
2. Write code following the coding conventions.
3. Use named exports and alias imports.
4. Write or update relevant tests (`*.test.*` files).
5. Commit changes using the `feat` prefix and a concise message.
6. Open a pull request for review.

### Code Testing
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Identify test files matching the `*.test.*` pattern.
2. Run the tests using the project's test runner (framework unknown; check project scripts).
3. Review test results and fix any failing tests.
4. Commit any necessary fixes with an appropriate commit message.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `userService.test.ts`
- The testing framework is not specified; check the project documentation or scripts for details.
- Place test files alongside or within a `tests` directory as appropriate.

## Commands
| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| /feature-development | Start a new feature development workflow  |
| /run-tests           | Run all test files in the repository      |
```