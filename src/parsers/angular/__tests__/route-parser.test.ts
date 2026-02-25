/**
 * route-parser.test.ts
 *
 * Unit tests for RouteParser using in-memory ts-morph projects.
 * No file system fixtures required — all source files are created in-memory.
 *
 * Covers:
 *   1. Inline ArrayLiteralExpression in RouterModule.forRoot([...])
 *   2. Same-file identifier: const routes: Routes = [...]; forRoot(routes)
 *   3. Cross-file identifier: import { routes } from './router'; forRoot(routes)
 *   4. Type-assertion wrapper: forRoot(routes as Routes)
 *   5. Graceful no-op when identifier has no array initializer
 *   6. Variable declaration scan: `const routes: Routes = [...]`
 *   7. Route record extraction from resolved cross-file array
 */

import { Project } from 'ts-morph';
import { RouteParser } from '../route-parser.js';
import type { AnalyzerConfig } from '../../../models/analyzer-config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(): Project {
  return new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
}

const cfg: AnalyzerConfig = {
  projectRoot: '/',
  tsConfigPath: '/tsconfig.json',
  framework: 'Angular',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RouteParser', () => {
  describe('findRoutesArrays — inline array literal', () => {
    it('finds array passed directly to RouterModule.forRoot', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        RouterModule.forRoot([{ path: 'home' }]);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });

    it('finds array passed directly to RouterModule.forChild', () => {
      const project = makeProject();
      const file = project.createSourceFile('/feature.module.ts', `
        RouterModule.forChild([{ path: 'users' }, { path: 'users/:id' }]);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });

    it('finds typed variable declaration const routes: Routes = [...]', () => {
      const project = makeProject();
      const file = project.createSourceFile('/routes.ts', `
        const routes: Routes = [{ path: 'home' }];
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });

    it('deduplicates when variable declaration and forRoot point to same array', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        const routes: Routes = [{ path: 'home' }];
        RouterModule.forRoot(routes);
      `);
      // Both the variable declaration scan and the identifier resolution see the
      // same ArrayLiteralExpression node (same file, same start position).
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });
  });

  describe('findRoutesArrays — same-file identifier resolution', () => {
    it('resolves identifier reference to array in same file', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        const myRoutes: Routes = [{ path: 'a' }, { path: 'b' }];
        RouterModule.forRoot(myRoutes);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      // myRoutes is found by variable scan AND by forRoot resolution → deduped to 1
      expect(arrays).toHaveLength(1);
    });

    it('resolves identifier not named routes when typed as Routes', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        const appRoutes: Routes = [{ path: 'dashboard' }];
        RouterModule.forRoot(appRoutes);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });
  });

  describe('findRoutesArrays — cross-file identifier resolution', () => {
    it('resolves identifier imported from another file', () => {
      const project = makeProject();
      project.createSourceFile('/router.ts', `
        export const routes: Routes = [{ path: 'home' }, { path: 'about' }];
      `);
      const appModule = project.createSourceFile('/app.module.ts', `
        import { routes } from './router';
        RouterModule.forRoot(routes);
      `);
      const arrays = RouteParser.findRoutesArrays(appModule);
      // Resolved to the array in router.ts
      expect(arrays).toHaveLength(1);
    });

    it('extracts route records from a cross-file resolved array', () => {
      const project = makeProject();
      project.createSourceFile('/router.ts', `
        export const routes: Routes = [
          { path: '', redirectTo: '/home', pathMatch: 'full' },
          { path: 'home', component: HomeComponent },
          { path: 'about', component: AboutComponent },
        ];
      `);
      const appModule = project.createSourceFile('/app.module.ts', `
        import { routes } from './router';
        RouterModule.forRoot(routes);
      `);
      const records = RouteParser.extractRoutesFromSourceFile(appModule, cfg);
      expect(records).toHaveLength(3);
      const paths = records.map((r) => r.path);
      expect(paths).toContain('');
      expect(paths).toContain('home');
      expect(paths).toContain('about');
    });

    it('cross-file resolved origin.file points to the defining file', () => {
      const project = makeProject();
      project.createSourceFile('/router.ts', `
        export const routes: Routes = [{ path: 'home', component: HomeComponent }];
      `);
      const appModule = project.createSourceFile('/app.module.ts', `
        import { routes } from './router';
        RouterModule.forRoot(routes);
      `);
      const records = RouteParser.extractRoutesFromSourceFile(appModule, cfg);
      expect(records).toHaveLength(1);
      // Origin should point to router.ts (where the route object literal lives)
      expect(records[0]?.origin.file).toMatch(/router\.ts$/);
    });
  });

  describe('findRoutesArrays — type-assertion unwrapping', () => {
    it('resolves identifier wrapped in AsExpression (routes as Routes)', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        const routes = [{ path: 'home' }];
        RouterModule.forRoot(routes as Routes);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      // Variable scan: 'routes' name matches → found
      // forRoot: 'routes as Routes' → unwrap → 'routes' → same array → deduped
      expect(arrays).toHaveLength(1);
    });

    it('resolves cross-file identifier wrapped in type assertion', () => {
      const project = makeProject();
      project.createSourceFile('/router.ts', `
        export const appRoutes = [{ path: 'x' }];
      `);
      const file = project.createSourceFile('/app.module.ts', `
        import { appRoutes } from './router';
        RouterModule.forRoot(appRoutes as Routes);
      `);
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(1);
    });
  });

  describe('findRoutesArrays — graceful handling of unresolvable identifiers', () => {
    it('returns empty array when identifier has no array initializer (call expression)', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        RouterModule.forRoot(getRoutes());
      `);
      expect(() => RouteParser.findRoutesArrays(file)).not.toThrow();
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(0);
    });

    it('returns empty array when identifier resolves to a function call result', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        const routes = computeRoutes();
        RouterModule.forRoot(routes);
      `);
      expect(() => RouteParser.findRoutesArrays(file)).not.toThrow();
      // 'routes' variable: name matches but initializer is CallExpression, not array
      const arrays = RouteParser.findRoutesArrays(file);
      expect(arrays).toHaveLength(0);
    });

    it('does not throw on missing symbol (unknown identifier)', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        RouterModule.forRoot(ROUTES_TOKEN);
      `);
      expect(() => RouteParser.findRoutesArrays(file)).not.toThrow();
    });
  });

  describe('extractRoutesFromSourceFile', () => {
    it('returns empty array for files with no route declarations', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.component.ts', `
        export class AppComponent {}
      `);
      const records = RouteParser.extractRoutesFromSourceFile(file, cfg);
      expect(records).toHaveLength(0);
    });

    it('extracts all route properties from inline array', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        RouterModule.forRoot([
          { path: '', redirectTo: '/home', pathMatch: 'full' },
          { path: 'home', component: HomeComponent },
        ]);
      `);
      const records = RouteParser.extractRoutesFromSourceFile(file, cfg);
      expect(records).toHaveLength(2);

      const redirect = records.find((r) => r.redirectTo !== undefined);
      expect(redirect?.path).toBe('');
      expect(redirect?.redirectTo).toBe('/home');
      expect(redirect?.pathMatch).toBe('full');

      const home = records.find((r) => r.componentName !== undefined);
      expect(home?.path).toBe('home');
      expect(home?.componentName).toBe('HomeComponent');
    });

    it('extracts lazy route (loadChildren)', () => {
      const project = makeProject();
      const file = project.createSourceFile('/app.module.ts', `
        RouterModule.forRoot([
          { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) },
        ]);
      `);
      const records = RouteParser.extractRoutesFromSourceFile(file, cfg);
      expect(records).toHaveLength(1);
      expect(records[0]?.loadChildrenExpr).toBeDefined();
      expect(records[0]?.loadChildrenExpr).toContain('admin.module');
    });
  });
});
