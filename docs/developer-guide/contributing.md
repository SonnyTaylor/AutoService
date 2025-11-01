# Contributing to AutoService

We welcome contributions! This guide will help you get started.

## Ways to Contribute

- **Report Bugs** - Found an issue? Open a GitHub issue
- **Suggest Features** - Have an idea? Create a feature request
- **Write Documentation** - Help others understand the project
- **Fix Bugs** - Submit PRs for reported issues
- **Add Services** - Create new diagnostic/maintenance services
- **Improve UI** - Enhance the user interface
- **Optimize Performance** - Make AutoService faster
- **Test** - Help test new features and report issues

## Getting Started

### 1. Set Up Development Environment

Follow the [Development Setup](dev-setup.md) guide.

### 2. Create a Feature Branch

```powershell
git checkout -b feature/your-feature-name
```

Branch naming:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Code improvements

### 3. Make Your Changes

- Keep commits focused and atomic
- Write descriptive commit messages
- Follow existing code style
- Add comments for complex logic

### 4. Test Your Changes

```powershell
# Frontend
pnpm test

# Backend
cargo test

# Python
python -m pytest runner/

# Full app
pnpm tauri dev
```

### 5. Submit a Pull Request

1. Push your branch to GitHub
2. Create a Pull Request with a clear description
3. Link any related issues
4. Wait for review and address feedback

## Code Style

### JavaScript

- Use camelCase for variables and functions
- Use UPPER_CASE for constants
- Use semicolons (automatic with most editors)
- Use `const` by default, `let` if reassignment needed

Example:

```javascript
const MAX_RETRIES = 3;

function handleUserInput(value) {
  const processed = value.trim();
  return processed;
}
```

### Rust

- Follow Rust conventions (rustfmt automatically)
- Use snake_case for functions and variables
- Use PascalCase for types and structs
- Add documentation comments (///)

Example:

```rust
/// Calculate the sum of two numbers
fn calculate_sum(a: i32, b: i32) -> i32 {
    a + b
}
```

### Python

- Follow PEP 8
- Use snake_case for functions and variables
- Add type hints where practical
- Document functions with docstrings

Example:

```python
def calculate_total(items: List[int]) -> int:
    """
    Calculate the total of a list of items.
    
    Args:
        items: List of integers to sum
        
    Returns:
        The sum of all items
    """
    return sum(items)
```

## Adding a New Service

The easiest way to contribute! Follow [Adding a Service](adding-service.md).

Quick checklist:

- [ ] Python service in `runner/services/`
- [ ] Registered in `runner/service_runner.py`
- [ ] Frontend handler in `src/pages/service/handlers/`
- [ ] Handler registered in handler index
- [ ] Test fixtures created
- [ ] Documentation in handler README

## Commit Messages

Write clear, descriptive commit messages:

```
# Good
feat: Add SSD health monitoring service
fix: Correct tool path resolution on network drives
docs: Update service development guide

# Avoid
update
fix stuff
changes
```

Format:

```
<type>: <subject>

<body (optional, for detailed changes)>

Fixes #123
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`

## Pull Request Guidelines

### Before Submitting

- [ ] All tests pass (`pnpm test`, `cargo test`)
- [ ] Code follows style guidelines
- [ ] No console errors or warnings
- [ ] Changes are documented (code comments, README, docs)
- [ ] Commit messages are clear and descriptive

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Other: ...

## Testing
How to test the changes

## Related Issues
Fixes #123

## Checklist
- [ ] Tests pass
- [ ] Code style follows guidelines
- [ ] Documentation updated
- [ ] No new warnings
```

## Issue Reporting

### Report a Bug

Include:

- AutoService version
- Windows version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Logs from `data/logs/`

### Request a Feature

Include:

- Clear description of desired functionality
- Use cases and benefits
- Any potential challenges
- Related features (if any)

## Documentation

Help improve documentation by:

- Fixing typos or unclear explanations
- Adding examples
- Clarifying complex concepts
- Keeping docs up-to-date with code changes

Documentation files:

- User guide: `docs/user-guide/`
- Developer guide: `docs/developer-guide/`
- Code comments: In source files
- README: `README.md`

## Project Guidelines

### Do's

- :heavy_check_mark: Write tests for new features
- :heavy_check_mark: Keep functions focused and small
- :heavy_check_mark: Comment non-obvious code
- :heavy_check_mark: Test on actual Windows systems
- :heavy_check_mark: Follow existing patterns
- :heavy_check_mark: Ask questions if unsure

### Don'ts

- ❌ Hard-code paths (use `resolveToolPath()`)
- ❌ Skip error handling
- ❌ Make unrelated changes in one PR
- ❌ Commit without testing
- ❌ Add breaking changes without discussion
- ❌ Ignore code review feedback

## Review Process

1. Your PR is reviewed by maintainers
2. Address any feedback or questions
3. Update code as needed
4. Rebase if necessary
5. PR is merged when approved

## License

By contributing, you agree your code will be licensed under GNU GPL v3.0 (same as the project).

## Code of Conduct

- Be respectful and inclusive
- Assume good intent
- Provide constructive feedback
- Report inappropriate behavior to maintainers

## Need Help?

- Check existing [GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues)
- Ask questions in PR discussions
- Read the [Architecture](architecture.md) documentation
- Review existing code for patterns

## Questions?

Feel free to open an issue or discussion on GitHub!

---

Thank you for contributing to AutoService! 🎉
