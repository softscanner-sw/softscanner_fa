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
 *   3. phase1-bundle.json is valid JSON and parseable as Phase1Bundle
 *   4. Bundle has the expected structure (multigraph + stats)
 *   5. All 6 node kinds present where applicable
 *   6. External node IDs are stable hashed strings (__ext__XXXXXXXX)
 *   7. All edges reference valid node IDs (edge.to can be null)
 *   8. SourceRef refs non-empty on all nodes and edges
 *   9. Stats consistency
 *  10. Determinism (byte-identical output)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Phase1Orchestrator } from '../phase1-orchestrator.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { Phase1Bundle } from '../../models/multigraph.js';
import { STRUCTURAL_EDGE_KINDS } from '../../models/multigraph.js';

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

function runOrchestrator(outputDir: string): Phase1Bundle {
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

    it('phase1-bundle.json is parseable JSON with multigraph+stats', () => {
      runOrchestrator(tmpDir);
      const raw = fs.readFileSync(path.join(tmpDir, 'phase1-bundle.json'), 'utf-8');
      const parsed = JSON.parse(raw) as Phase1Bundle;
      expect(parsed).toHaveProperty('multigraph');
      expect(parsed).toHaveProperty('stats');
      expect(parsed.multigraph).toHaveProperty('nodes');
      expect(parsed.multigraph).toHaveProperty('edges');
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
    let bundle: Phase1Bundle;

    beforeEach(() => {
      bundle = runOrchestrator(tmpDir);
    });

    it('bundle has only multigraph and stats top-level keys', () => {
      expect(bundle).toHaveProperty('multigraph');
      expect(bundle).toHaveProperty('stats');
      expect(Object.keys(bundle).sort()).toEqual(['multigraph', 'stats']);
    });

    it('multigraph has nodes and edges', () => {
      expect(Array.isArray(bundle.multigraph.nodes)).toBe(true);
      expect(Array.isArray(bundle.multigraph.edges)).toBe(true);
      expect(bundle.multigraph.nodes.length).toBeGreaterThan(0);
    });

    it('includes Route nodes for all routes', () => {
      const routeNodes = bundle.multigraph.nodes.filter((n) => n.kind === 'Route');
      expect(routeNodes.length).toBe(3);
    });

    it('includes Component nodes for every registered component', () => {
      const compNodes = bundle.multigraph.nodes.filter((n) => n.kind === 'Component');
      expect(compNodes.length).toBe(3);
    });

    it('includes at least one Module node', () => {
      const modNodes = bundle.multigraph.nodes.filter((n) => n.kind === 'Module');
      expect(modNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('includes at least one External node (angular.io href)', () => {
      const extNodes = bundle.multigraph.nodes.filter((n) => n.kind === 'External');
      expect(extNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('External node IDs use stable hash format (__ext__XXXXXXXX)', () => {
      const extNodes = bundle.multigraph.nodes.filter((n) => n.kind === 'External');
      for (const node of extNodes) {
        expect(node.id).toMatch(/^__ext__[0-9a-f]{8}$/);
      }
    });

    it('all edge from/to IDs exist in nodes (to can be null)', () => {
      const nodeIds = new Set(bundle.multigraph.nodes.map((n) => n.id));
      for (const edge of bundle.multigraph.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        if (edge.to !== null) {
          expect(nodeIds.has(edge.to)).toBe(true);
        }
      }
    });

    it('nodes are sorted lexicographically by id', () => {
      const ids = bundle.multigraph.nodes.map((n) => n.id);
      expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    });

    it('edges are sorted by (from, kind, to, id)', () => {
      const edges = bundle.multigraph.edges;
      for (let i = 1; i < edges.length; i++) {
        const prev = edges[i - 1];
        const curr = edges[i];
        const fromCmp = prev.from.localeCompare(curr.from);
        if (fromCmp > 0) fail(`edges not sorted by from`);
        if (fromCmp < 0) continue;
        const kindCmp = prev.kind.localeCompare(curr.kind);
        if (kindCmp > 0) fail(`edges not sorted by kind`);
        if (kindCmp < 0) continue;
        const toCmp = (prev.to ?? '').localeCompare(curr.to ?? '');
        if (toCmp > 0) fail(`edges not sorted by to`);
        if (toCmp < 0) continue;
        expect(prev.id.localeCompare(curr.id)).toBeLessThanOrEqual(0);
      }
    });

    it('all nodes have non-empty refs', () => {
      for (const node of bundle.multigraph.nodes) {
        expect(node.refs.length).toBeGreaterThan(0);
      }
    });

    it('all edges have non-empty refs', () => {
      for (const edge of bundle.multigraph.edges) {
        expect(edge.refs.length).toBeGreaterThan(0);
      }
    });

    it('all edges have constraints', () => {
      for (const edge of bundle.multigraph.edges) {
        expect(edge.constraints).toBeDefined();
        expect(Array.isArray(edge.constraints.requiredParams)).toBe(true);
      }
    });

    it('includes ROUTE_ACTIVATES_COMPONENT edges for ComponentRoutes', () => {
      const activationEdges = bundle.multigraph.edges.filter(
        (e) => e.kind === 'ROUTE_ACTIVATES_COMPONENT',
      );
      expect(activationEdges.length).toBeGreaterThanOrEqual(2);
    });

    it('stats are consistent with actual node/edge counts', () => {
      const { stats, multigraph } = bundle;
      expect(stats.nodeCount).toBe(multigraph.nodes.length);
      expect(stats.edgeCount).toBe(multigraph.edges.length);
      const actualStructural = multigraph.edges.filter(
        (e) => STRUCTURAL_EDGE_KINDS.has(e.kind),
      ).length;
      expect(stats.structuralEdgeCount).toBe(actualStructural);
      expect(stats.executableEdgeCount).toBe(multigraph.edges.length - actualStructural);
    });
  });
});
