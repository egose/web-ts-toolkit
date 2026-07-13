---
name: template-frontend-forms
description: todo-form.tsx, react-hook-form, zod, Controller, Select, Checkbox, validation messages. Use when changing form fields, validation, submit flow, or form accessibility in the access-router Mongo starter template.
---

# Template Frontend Forms

Use this skill for form behavior inside the starter, especially `src/pages/todo-form.tsx`.

## Primary Files

- `src/pages/todo-form.tsx`
- `tests/todo-form.test.tsx`

## Use This Skill When

- adding, removing, renaming, or reordering form fields
- changing validation rules, default values, or error messages
- wiring shadcn or Radix controls through `react-hook-form`
- adjusting submit, cancel, or edit-mode behavior

## Current Form Pattern

- Validation is defined with `zod` and connected through `zodResolver(...)`.
- Standard inputs use `register(...)`.
- Controlled components such as `Select` and `Checkbox` use `Controller`.
- The current form supports both create and edit flows through `initialValues` and `submitLabel`.

## Workflow

1. Update the `zod` schema first so the allowed payload is clear.
2. Keep `defaultValues`, `initialValues`, and submit payload shaping aligned.
3. Use `Controller` for controls that do not behave like a plain text input.
4. Keep labels, placeholders, and validation messages clear and testable.
5. Update `tests/todo-form.test.tsx` whenever form behavior changes.
6. If the field set changes, coordinate with `template-client-data` and `template-api-models-and-routers` so client types, request schemas, and database models stay in sync.

## Editing Guidance

- Prefer preserving the existing form component rather than introducing a new abstraction.
- Avoid duplicating validation rules across multiple places without need.
- Keep submit payloads normalized before they leave the form. For example, optional selections may need to map back to empty string or `null` depending on downstream expectations.
- When a control needs special test setup, keep the implementation compatible with the existing jsdom environment from `tests/setup.ts`.

## Verification

- `pnpm test`
- `pnpm build`

Prioritize behavior-focused assertions: successful submit, blocked invalid submit, and any new field-specific validation paths.
