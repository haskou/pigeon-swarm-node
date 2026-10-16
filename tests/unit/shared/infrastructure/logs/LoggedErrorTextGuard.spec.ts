import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Exception messages and stacks can carry identity ids, record keys,
 * addresses or payload fragments, so a log line may name a caught error only
 * through a function that reduces it to a fixed label or a flag.
 */
const ERROR_LABELLING_FUNCTIONS = new Set([
  'errorClassName',
  'getIPNSResolutionSkipReason',
  'isOrbitDBTransientBlockError',
]);
const ERROR_PARAMETER_TYPES = new Set(['Error', 'unknown']);
const ERROR_TEXT_PROPERTIES = new Set(['message', 'stack']);
const LOG_METHODS = new Set(['debug', 'error', 'info', 'log', 'warn']);
/** A fatal startup failure is logged once with its stack before exit. */
const STARTUP_FAILURE_LOG = 'src/index.ts';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(entryPath);

    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function isLogCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;

  const callee = node.expression;

  if (ts.isElementAccessExpression(callee)) {
    return /logger\??$/.test(callee.expression.getText());
  }

  if (!ts.isPropertyAccessExpression(callee)) return false;

  const receiver = callee.expression.getText();

  return (
    LOG_METHODS.has(callee.name.text) &&
    (/logger\??$/.test(receiver) || receiver === 'this')
  );
}

function isCatchCallback(fn: ts.SignatureDeclaration): boolean {
  const call = fn.parent;

  return (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'catch'
  );
}

function errorParameters(fn: ts.SignatureDeclaration): string[] {
  const catchCallback = isCatchCallback(fn);

  return fn.parameters
    .filter(
      (parameter) =>
        catchCallback ||
        ERROR_PARAMETER_TYPES.has(parameter.type?.getText() ?? ''),
    )
    .flatMap((parameter) =>
      ts.isIdentifier(parameter.name) ? [parameter.name.text] : [],
    );
}

/** Names bound to a caught value in the scopes enclosing `node`. */
function caughtNames(node: ts.Node): Set<string> {
  const names = new Set<string>();

  for (let current = node.parent; current; current = current.parent) {
    const binding = ts.isCatchClause(current)
      ? current.variableDeclaration?.name
      : undefined;

    if (binding && ts.isIdentifier(binding)) names.add(binding.text);

    if (ts.isFunctionLike(current)) {
      errorParameters(current).forEach((name) => names.add(name));
    }
  }

  return names;
}

function isLabelled(identifier: ts.Identifier): boolean {
  const call = identifier.parent;

  if (!ts.isCallExpression(call) || !call.arguments.includes(identifier)) {
    return false;
  }

  const callee = call.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : callee.getText();

  return ERROR_LABELLING_FUNCTIONS.has(name);
}

function declaredInitializer(
  block: ts.Node,
  name: string,
): ts.Expression | undefined {
  let initializer: ts.Expression | undefined;
  const find = (child: ts.Node): void => {
    if (
      ts.isVariableDeclaration(child) &&
      ts.isIdentifier(child.name) &&
      child.name.text === name
    ) {
      initializer ??= child.initializer;
    }

    if (!ts.isFunctionLike(child)) child.forEachChild(find);
  };

  block.forEachChild(find);

  return initializer;
}

/** The initializer of the local variable `name` visible from `scope`. */
function localInitializer(
  name: string,
  scope: ts.Node,
): ts.Expression | undefined {
  for (let current = scope.parent; current; current = current.parent) {
    const initializer = ts.isBlock(current)
      ? declaredInitializer(current, name)
      : undefined;

    if (initializer) return initializer;

    if (ts.isFunctionLike(current)) return undefined;
  }

  return undefined;
}

class ErrorTextFinder {
  constructor(
    private readonly caught: Set<string>,
    private readonly scope: ts.Node,
  ) {}

  private leaksThroughIdentifier(
    identifier: ts.Identifier,
    visited: Set<string>,
  ): boolean {
    if (ts.isPropertyAccessExpression(identifier.parent)) return false;

    if (this.caught.has(identifier.text)) return !isLabelled(identifier);

    if (visited.has(identifier.text)) return false;

    const initializer = localInitializer(identifier.text, this.scope);

    return (
      initializer !== undefined &&
      this.leaks(initializer, new Set([...visited, identifier.text]))
    );
  }

  public leaks(node: ts.Node, visited: Set<string> = new Set()): boolean {
    if (
      ts.isPropertyAccessExpression(node) &&
      ERROR_TEXT_PROPERTIES.has(node.name.text)
    ) {
      return true;
    }

    if (ts.isIdentifier(node)) {
      return this.leaksThroughIdentifier(node, visited);
    }

    return (
      node.forEachChild((child) => this.leaks(child, visited) || undefined) ??
      false
    );
  }
}

function leakingLogLines(file: string, relative: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const lines: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isLogCall(node)) {
      const finder = new ErrorTextFinder(caughtNames(node), node);

      if (node.arguments.some((argument) => finder.leaks(argument))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());

        lines.push(`${relative}:${line + 1}`);
      }
    }

    node.forEachChild(visit);
  };

  visit(source);

  return lines;
}

describe('Logged error text', () => {
  it('should name caught errors in application logs only by their class', () => {
    const root = process.cwd();
    const leaks = sourceFiles(path.join(root, 'src'))
      .map((file) => [file, path.relative(root, file)])
      .filter(([, relative]) => relative !== STARTUP_FAILURE_LOG)
      .flatMap(([file, relative]) => leakingLogLines(file, relative));

    expect(leaks).toEqual([]);
  });
});
