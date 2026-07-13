const fs = require('fs');
const path = require('path');

const runtimeFile = 'node_modules/@libp2p/utils/dist/src/queue/job.js';
const patchedMarker = 'const activeProgressDispatches = new Map';
const files = [
  {
    relativePath: runtimeFile,
    replacements: [
      [
        'import { JobRecipient } from "./recipient.js";\n',
        'import { JobRecipient } from "./recipient.js";\nconst activeProgressDispatches = new Map();\n',
      ],
      ['    dispatchingProgress;\n', ''],
      ['        this.dispatchingProgress = false;\n', ''],
      [
        `                    // Recipients can transitively re-enter this dispatcher; without
                    // this guard a single event recurses until the stack overflows.
                    if (this.dispatchingProgress) {
                        return;
                    }
                    this.dispatchingProgress = true;
                    try {
                        this.recipients.forEach(recipient => {
                            recipient.onProgress?.(evt);
                        });
                    }
                    finally {
                        this.dispatchingProgress = false;
                    }`,
        `                    let dispatch = activeProgressDispatches.get(evt);
                    if (dispatch == null) {
                        dispatch = { depth: 0, jobs: new Set() };
                        activeProgressDispatches.set(evt, dispatch);
                    }
                    if (dispatch.jobs.has(this)) {
                        return;
                    }
                    dispatch.jobs.add(this);
                    dispatch.depth++;
                    try {
                        this.recipients.forEach(recipient => {
                            recipient.onProgress?.(evt);
                        });
                    }
                    finally {
                        dispatch.depth--;
                        if (dispatch.depth === 0) {
                            activeProgressDispatches.delete(evt);
                        }
                    }`,
      ],
    ],
  },
  {
    relativePath: 'node_modules/@libp2p/utils/src/queue/job.ts',
    replacements: [
      [
        "import type { ProgressOptions } from 'progress-events'\n",
        `import type { ProgressOptions } from 'progress-events'

type ProgressDispatch = {
  depth: number
  jobs: Set<Job>
}

const activeProgressDispatches = new Map<unknown, ProgressDispatch>()
`,
      ],
      ['  private dispatchingProgress: boolean\n', ''],
      ['    this.dispatchingProgress = false\n\n', ''],
      [
        `          // Recipients can transitively re-enter this dispatcher; without
          // this guard a single event recurses until the stack overflows.
          if (this.dispatchingProgress) {
            return
          }

          this.dispatchingProgress = true

          try {
            this.recipients.forEach(recipient => {
              recipient.onProgress?.(evt)
            })
          } finally {
            this.dispatchingProgress = false
          }`,
        `          let dispatch = activeProgressDispatches.get(evt)

          if (dispatch == null) {
            dispatch = { depth: 0, jobs: new Set() }
            activeProgressDispatches.set(evt, dispatch)
          }

          if (dispatch.jobs.has(this)) {
            return
          }

          dispatch.jobs.add(this)
          dispatch.depth++

          try {
            this.recipients.forEach(recipient => {
              recipient.onProgress?.(evt)
            })
          } finally {
            dispatch.depth--

            if (dispatch.depth === 0) {
              activeProgressDispatches.delete(evt)
            }
          }`,
      ],
    ],
  },
];

let runtimeFileWasFound = false;

for (const file of files) {
  const filePath = path.join(process.cwd(), file.relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  if (file.relativePath === runtimeFile) {
    runtimeFileWasFound = true;
  }

  const current = fs.readFileSync(filePath, 'utf8');

  if (current.includes(patchedMarker)) {
    continue;
  }

  let next = current;

  for (const [search, replacement] of file.replacements) {
    if (!next.includes(search)) {
      throw new Error(`Unable to patch ${file.relativePath}`);
    }

    next = next.replace(search, replacement);
  }

  fs.writeFileSync(filePath, next);
  console.log(`Patched ${file.relativePath}`);
}

if (!runtimeFileWasFound) {
  throw new Error(`Unable to find libp2p queue runtime file: ${runtimeFile}`);
}
