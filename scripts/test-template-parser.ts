#!/usr/bin/env tsx
/**
 * Quick diagnostic: verifies AngularTemplateParser produces a correct AST.
 */
import { AngularTemplateParser } from '../src/parsers/angular/template-parser.js';

const html = `
<mat-toolbar color="primary">
  <button mat-button [routerLink]="'/posts'" (click)="go()">Posts</button>
  <a href="https://example.com">External</a>
</mat-toolbar>
`;

const cfg = {
  projectRoot: '',
  tsConfigPath: '',
  framework: 'Angular' as const,
  backendGranularity: 'None' as const,
};

const ast = AngularTemplateParser.parse(html, cfg);
console.log('AST node count:', ast.length);
console.log(JSON.stringify(ast, null, 2));
