# Instrucciones para Commit Messages

## title

Usa [Conventional Commits](https://www.conventionalcommits.org/) con un código Jira (si está presente en la rama) como scope y un emoji representativo del tipo de cambio.

Formato general:

```txt
<type>: <emoji> Short description in English
```

Ejemplos:

- feat(ALL-6025): ✨ Remove createdBy and companyId from issuer body on invoice create and update
- refactor: ♻️ Adjust input formatting
- fix(BE-3453): 🐛 Fix issue with invoice creation

Los emojis deben obtenerse de la guía oficial de Gitmoji: 👉 [https://gitmoji.dev](https://gitmoji.dev)

## Tipos comunes

- `feat`: Nueva funcionalidad.
- `fix`: Correcciones (hotfixes).
- `docs`: Documentación.
- `refactor`: Refactorización sin cambios funcionales.
- `test`: Añadir o corregir tests.
- `chore`: Tareas rutinarias.
- `style`: Cambios de formato sin lógica.
- `perf`: Mejoras de rendimiento.
