/**
 * phase1-orchestrator.integration.test.ts
 *
 * Integration tests for Phase1Orchestrator using the in-repo fixture at
 * tests/fixtures/minimal-ng/.
 *
 * Fixture structure:
 *   AppModule with 3 routes: redirect('/' → '/home'), /home, /about
 *   HomeComponent  — has a routerLink to /about
 *   AboutComponent — has a routerLink to /home + an external href
 *
 * These tests verify:
 *   1. Output directory is created on disk when outputDir option is set
 *   2. phase1-bundle.json is written to the output directory
 *   3. phase1-bundle.json is valid JSON and parseable
 *   4. Bundle has the expected structure (nodes, edges, Component nodes, UI_EFFECT)
 *   5. External node IDs are stable hashed strings (__ext__XXXXXXXX)
 *   6. All edges are from/to node IDs that exist in the node list
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Phase1Orchestrator } from '../phase1-orchestrator.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { Phase1AnalysisBundle } from '../../models/analysis-bundle.js';

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FIXTURE_ROOT = path.resolve('tests/fixtures/minimal-ng');
const FIXTURE_TSCONFIG = path.join(FIXTURE_ROOT, 'tsconfig.json');

function makeConfig(): AnalyzerConfig {
  return {
    projectRoot: FIXTURE_ROOT,
    tsConfigPath: FIXTURE_TSCONFIG,
    framework: 'Angular',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'softscanner-int-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runOrchestrator(outputDir: string): Phase1AnalysisBundle {
  return new Phase1Orchestrator(makeConfig(), {
    outputPath: path.join(outputDir, 'phase1-bundle.json'),
    debugOutputDir: outputDir,
    skipValidation: false,
  }).run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase1Orchestrator — integration (minimal-ng fixture)', () => {
  describe('Output writing', () => {
    it('creates the output directory when it does not exist', () => {
      const newDir = path.join(tmpDir, 'sub', 'output');
      expect(fs.existsSync(newDir)).toBe(false);
      runOrchestrator(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('writes phase1-bundle.json to the output directory', () => {
      runOrchestrator(tmpDir);
      const bundlePath = path.join(tmpDir, 'phase1-bundle.json');
      expect(fs.existsSync(bundlePath)).toBe(true);
    });

    it('writes debug artifact files (graph.json, routes.json, components.json, etc.)', () => {
      runOrchestrator(tmpDir);
      for (const name of ['graph.json', 'routes.json', 'components.json',
                          'modules.json', 'widgetEventMaps.json', 'config.json', 'stats.json']) {
        expect(fs.existsSync(path.join(tmpDir, name))).toBe(true);
      }
    });

    it('phase1-bundle.json is parseable JSON', () => {
      runOrchestrator(tmpDir);
      const raw = fs.readFileSync(path.join(tmpDir, 'phase1-bundle.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('phase1-bundle.json is byte-identical across two runs (determinism)', () => {
      const out1 = path.join(tmpDir, 'run1');
      const out2 = path.join(tmpDir, 'run2');
      fs.mkdirSync(out1);
      fs.mkdirSync(out2);
      runOrchestrator(out1);
      runOrchestrator(out2);
      const b1 = fs.readFileSync(path.join(out1, 'phase1-bundle.json'), 'utf-8');
      const b2 = fs.readFileSync(path.join(out2, 'phase1-bundle.json'), 'utf-8');
      expect(b1).toBe(b2);
    });
  });

  describe('Bundle structure', () => {
    let bundle: Phase1AnalysisBundle;

    beforeEach(() => {
      bundle = runOrchestrator(tmpDir);
    });

    it('bundle has all required top-level keys', () => {
      expect(bundle).toHaveProperty('componentRegistry');
      expect(bundle).toHaveProperty('moduleRegistry');
      expect(bundle).toHaveProperty('routeMap');
      expect(bundle).toHaveProperty('widgetEventMaps');
      expect(bundle).toHaveProperty('navigation');
      expect(bundle).toHaveProperty('stats');
    });

    it('extracts the expected number of routes (3)', () => {
      expect(bundle.routeMap.routes).toHaveLength(3);
    });

    it('extracts the expected number of components (3)', () => {
      expect(bundle.componentRegistry.components).toHaveLength(3);
    });

    it('navigation graph includes a Virtual __entry__ node', () => {
      const entry = bundle.navigation.nodes.find((n) => n.id === '__entry__');
      expect(entry).toBeDefined();
      expect(entry!.type).toBe('Virtual');
    });

    it('navigation graph includes Component nodes for every registered component', () => {
      const compNodeIds = bundle.navigation.nodes
        .filter((n) => n.type === 'Component')
        .map((n) => n.id);
      for (const comp of bundle.componentRegistry.components) {
        expect(compNodeIds).toContain(comp.id);
      }
    });

    it('navigation graph includes Route nodes for every route', () => {
      const routeNodeIds = bundle.navigation.nodes
        .filter((n) => n.type === 'Route')
        .map((n) => n.id);
      for (const route of bundle.routeMap.routes) {
        expect(routeNodeIds).toContain(route.id);
      }
    });

    it('navigation graph includes UI_EFFECT Route→Component transitions for ComponentRoutes', () => {
      const uiEffectEdges = bundle.navigation.edges.filter((e) =>
        e.transitions.some((t) => t.kind === 'UI_EFFECT'),
      );
      const componentRoutes = bundle.routeMap.routes.filter(
        (r) => r.kind === 'ComponentRoute',
      );
      // At minimum one UI_EFFECT edge per ComponentRoute
      expect(uiEffectEdges.length).toBeGreaterThanOrEqual(componentRoutes.length);
    });

    it('navigation graph includes at least one External node (angular.io href)', () => {
      const extNodes = bundle.navigation.nodes.filter((n) => n.type === 'External');
      expect(extNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('External node IDs use stable hash format (__ext__XXXXXXXX)', () => {
      const extNodes = bundle.navigation.nodes.filter((n) => n.type === 'External');
      for (const node of extNodes) {
        expect(node.id).toMatch(/^__ext__[0-9a-f]{8}$/);
      }
    });

    it('all GraphEdge from/to IDs exist in navigation.nodes', () => {
      const nodeIds = new Set(bundle.navigation.nodes.map((n) => n.id));
      for (const edge of bundle.navigation.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        expect(nodeIds.has(edge.to)).toBe(true);
      }
    });

    it('navigation.nodes are sorted lexicographically by id', () => {
      const ids = bundle.navigation.nodes.map((n) => n.id);
      expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    });

    it('navigation.edges are sorted lexicographically by id', () => {
      const ids = bundle.navigation.edges.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    });

    it('each GraphEdge has exactly one transition', () => {
      for (const edge of bundle.navigation.edges) {
        expect(edge.transitions).toHaveLength(1);
      }
    });

    it('every GraphTransition has a non-empty origin.file', () => {
      for (const edge of bundle.navigation.edges) {
        for (const t of edge.transitions) {
          // Virtual __entry__ transitions are exempt from strict origin checks,
          // but origin.file must still be a non-empty string.
          expect(typeof t.origin.file).toBe('string');
          expect(t.origin.file.length).toBeGreaterThan(0);
        }
      }
    });

    it('stats reflect the extracted data', () => {
      const stats = bundle.stats;
      expect(stats).toBeDefined();
      expect(stats!.routes).toBe(bundle.routeMap.routes.length);
      expect(stats!.components).toBe(bundle.componentRegistry.components.length);
      expect(stats!.edges).toBe(bundle.navigation.edges.length);
    });
  });
});
