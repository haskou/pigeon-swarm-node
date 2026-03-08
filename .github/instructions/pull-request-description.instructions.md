# 📋 Instrucciones para Pull Requests

## 🏷️ Título de la PR

Sigue la convención de [Conventional Commits](https://www.conventionalcommits.org/) usando:

```txt
<type>(JIRA-XXX): <emoji> Short description
```

**Ejemplos:**

- `feat(ALL-6025): ✨ Remove createdBy and companyId from issuer body`
- `refactor(ALL-5896): ♲️ Serial number generation`

🧠 _Emojis de la guía oficial:_ [https://gitmoji.dev](https://gitmoji.dev)

Tipos comunes:

- `feat`: Nueva funcionalidad
- `fix`: Correcciones
- `docs`: Documentación
- `refactor`: Refactor sin cambios funcionales
- `test`: Añadir o corregir tests

---

## 📋 Cuerpo de la PR (Plantilla obligatoria)

Copia y completa **estrictamente** el siguiente bloque en la descripción de la PR:

```md
### **🛠 Cambios realizados**

Describe brevemente en español qué hiciste, en 1–2 líneas como máximo.

- [ ] **Endpoints afectados**: ¿Se modificaron endpoints productivos?
      SI / NO. En caso afirmativo, detalla en la tarea de Jira.
- [ ] **Refactor posible**: ¿Hay oportunidades claras de refactor?
      SI / NO. Justifica si aplica.

### **🧠 Justificación del cambio (Tarea Jira)**

Explica por qué se hizo este cambio. ¿Qué problema resuelve o mejora?

### **🧪 Estrategia de pruebas**

- [ ] **Pruebas manuales**: describe pasos realizados en local/dev.
- [ ] **Pruebas automáticas**: ¿hay tests relevantes? - Tests unitarios (`.spec`): Copilot revisará si se han añadido o modificado archivos `.spec` relacionados con los cambios. - Tests de aceptación (`.feature`): Copilot verificará si se han actualizado o agregado archivos `.feature` vinculados.
```

🔎 _El copiloto debe inspeccionar el diff del código para identificar presencia y correspondencia de archivos `.spec` y `.feature`._

---

## 👥 Revisión de Código

### Automatización recomendada

Incluye en el repo un archivo `CODEOWNERS` para asignar revisores automáticamente:

```txt
# Asignar al equipo de backend por defecto
* @organization/backend-team
```

### Alternativa manual

Si no hay `CODEOWNERS`, **asigna manualmente** al equipo de backend al crear la PR.

✔️ Esto garantiza revisiones técnicas eficientes y colaboración fluida.
