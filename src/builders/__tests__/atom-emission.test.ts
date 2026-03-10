/**
 * atom-emission.test.ts
 *
 * Unit tests for the atom emission functions (spec §7):
 *   - buildWidgetAtoms: visibility, enabledness, requiredness atoms
 *   - buildFormAtom: FormValid atom for form submission
 *   - buildInputConstraintAtoms: InputConstraint atoms for literal shape constraints
 *
 * These are pure function tests — no builder or AST dependencies.
 */

import type { SourceRef, WidgetUIProps } from '../../models/multigraph.js';
import { buildWidgetAtoms, buildFormAtom, buildInputConstraintAtoms } from '../navigation-graph-builder.js';

const REF: SourceRef = { file: 'test.html', start: 0, end: 100 };
const WIDGET_ID = 'comp1::Button::0::0';

function emptyUI(): WidgetUIProps {
  return { rawAttrsText: {} };
}

// ---------------------------------------------------------------------------
// buildWidgetAtoms — visibility
// ---------------------------------------------------------------------------

describe('buildWidgetAtoms — visibility', () => {
  it('emits WidgetVisible atom when visibleLiteral is false', () => {
    const ui = { ...emptyUI(), visibleLiteral: false };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetVisible',
      args: [WIDGET_ID, 'false'],
      source: REF,
    });
  });

  it('emits WidgetVisibleExpr atom when visibleExprText is set', () => {
    const ui = { ...emptyUI(), visibleExprText: 'isLoggedIn' };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetVisibleExpr',
      args: [WIDGET_ID, 'isLoggedIn'],
      source: REF,
    });
  });

  it('emits no visibility atoms when neither literal nor expr is set', () => {
    const atoms = buildWidgetAtoms(WIDGET_ID, emptyUI(), REF);
    const visAtoms = atoms.filter(
      (a) => a.kind === 'WidgetVisible' || a.kind === 'WidgetVisibleExpr',
    );
    expect(visAtoms).toHaveLength(0);
  });

  it('prefers literal over expr (both set: only WidgetVisible emitted)', () => {
    const ui = { ...emptyUI(), visibleLiteral: false, visibleExprText: 'someExpr' };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    const visAtoms = atoms.filter(
      (a) => a.kind === 'WidgetVisible' || a.kind === 'WidgetVisibleExpr',
    );
    // Literal false → WidgetVisible; expr should NOT also be emitted
    expect(visAtoms).toHaveLength(1);
    expect(visAtoms[0]!.kind).toBe('WidgetVisible');
  });
});

// ---------------------------------------------------------------------------
// buildWidgetAtoms — enabledness
// ---------------------------------------------------------------------------

describe('buildWidgetAtoms — enabledness', () => {
  it('emits WidgetEnabled atom when enabledLiteral is false', () => {
    const ui = { ...emptyUI(), enabledLiteral: false };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetEnabled',
      args: [WIDGET_ID, 'false'],
      source: REF,
    });
  });

  it('emits WidgetEnabledExpr atom when enabledExprText is set', () => {
    const ui = { ...emptyUI(), enabledExprText: '!form.valid' };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetEnabledExpr',
      args: [WIDGET_ID, '!form.valid'],
      source: REF,
    });
  });

  it('emits no enabledness atoms when neither literal nor expr is set', () => {
    const atoms = buildWidgetAtoms(WIDGET_ID, emptyUI(), REF);
    const enabAtoms = atoms.filter(
      (a) => a.kind === 'WidgetEnabled' || a.kind === 'WidgetEnabledExpr',
    );
    expect(enabAtoms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildWidgetAtoms — requiredness
// ---------------------------------------------------------------------------

describe('buildWidgetAtoms — requiredness', () => {
  it('emits WidgetRequired atom when requiredLiteral is true', () => {
    const ui = { ...emptyUI(), requiredLiteral: true };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetRequired',
      args: [WIDGET_ID, 'true'],
      source: REF,
    });
  });

  it('emits WidgetRequiredExpr atom when requiredExprText is set', () => {
    const ui = { ...emptyUI(), requiredExprText: 'isFieldRequired' };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'WidgetRequiredExpr',
      args: [WIDGET_ID, 'isFieldRequired'],
      source: REF,
    });
  });

  it('emits no requiredness atoms when neither is set', () => {
    const atoms = buildWidgetAtoms(WIDGET_ID, emptyUI(), REF);
    const reqAtoms = atoms.filter(
      (a) => a.kind === 'WidgetRequired' || a.kind === 'WidgetRequiredExpr',
    );
    expect(reqAtoms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildWidgetAtoms — multiple atoms coexist
// ---------------------------------------------------------------------------

describe('buildWidgetAtoms — combined', () => {
  it('emits multiple atom kinds for a widget with both visibility and enabledness', () => {
    const ui: WidgetUIProps = {
      ...emptyUI(),
      visibleLiteral: false,
      enabledExprText: '!isSubmitting',
      requiredLiteral: true,
    };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);

    expect(atoms).toHaveLength(3);
    expect(atoms.map((a) => a.kind).sort()).toEqual([
      'WidgetEnabledExpr',
      'WidgetRequired',
      'WidgetVisible',
    ].sort());
  });

  it('produces atoms in deterministic order: visible, enabled, required', () => {
    const ui: WidgetUIProps = {
      ...emptyUI(),
      visibleExprText: 'expr1',
      enabledExprText: 'expr2',
      requiredExprText: 'expr3',
    };
    const atoms = buildWidgetAtoms(WIDGET_ID, ui, REF);
    expect(atoms.map((a) => a.kind)).toEqual([
      'WidgetVisibleExpr',
      'WidgetEnabledExpr',
      'WidgetRequiredExpr',
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildFormAtom
// ---------------------------------------------------------------------------

describe('buildFormAtom', () => {
  it('emits FormValid atom with correct args', () => {
    const atom = buildFormAtom(WIDGET_ID, REF);
    expect(atom).toEqual({
      kind: 'FormValid',
      args: [WIDGET_ID],
      source: REF,
    });
  });
});

// ---------------------------------------------------------------------------
// buildInputConstraintAtoms
// ---------------------------------------------------------------------------

describe('buildInputConstraintAtoms', () => {
  it('emits InputConstraint for minLength', () => {
    const ui = { ...emptyUI(), minLength: 3 };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'InputConstraint',
      args: [WIDGET_ID, 'minLength', '3'],
      source: REF,
    });
  });

  it('emits InputConstraint for maxLength', () => {
    const ui = { ...emptyUI(), maxLength: 100 };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'InputConstraint',
      args: [WIDGET_ID, 'maxLength', '100'],
      source: REF,
    });
  });

  it('emits InputConstraint for min (numeric)', () => {
    const ui = { ...emptyUI(), min: 0 };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'InputConstraint',
      args: [WIDGET_ID, 'min', '0'],
      source: REF,
    });
  });

  it('emits InputConstraint for max (numeric)', () => {
    const ui = { ...emptyUI(), max: 99 };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'InputConstraint',
      args: [WIDGET_ID, 'max', '99'],
      source: REF,
    });
  });

  it('emits InputConstraint for pattern', () => {
    const ui = { ...emptyUI(), pattern: '^[a-z]+$' };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toContainEqual({
      kind: 'InputConstraint',
      args: [WIDGET_ID, 'pattern', '^[a-z]+$'],
      source: REF,
    });
  });

  it('emits multiple InputConstraint atoms when multiple constraints present', () => {
    const ui: WidgetUIProps = {
      ...emptyUI(),
      minLength: 2,
      maxLength: 50,
      pattern: '\\d+',
    };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms).toHaveLength(3);
    const keys = atoms.map((a) => a.args[1]);
    expect(keys).toEqual(['minLength', 'maxLength', 'pattern']);
  });

  it('emits no atoms when no constraints present', () => {
    const atoms = buildInputConstraintAtoms(WIDGET_ID, emptyUI(), REF);
    expect(atoms).toHaveLength(0);
  });

  it('converts numeric values to strings correctly', () => {
    const ui = { ...emptyUI(), min: -5, max: 0 };
    const atoms = buildInputConstraintAtoms(WIDGET_ID, ui, REF);
    expect(atoms[0]!.args[2]).toBe('-5');
    expect(atoms[1]!.args[2]).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Determinism — same input produces same output
// ---------------------------------------------------------------------------

describe('atom emission determinism', () => {
  it('produces identical atom arrays for identical inputs across multiple calls', () => {
    const ui: WidgetUIProps = {
      ...emptyUI(),
      visibleExprText: 'showButton',
      enabledLiteral: false,
      requiredLiteral: true,
      minLength: 5,
      maxLength: 100,
    };

    const atoms1 = [
      ...buildWidgetAtoms(WIDGET_ID, ui, REF),
      ...buildInputConstraintAtoms(WIDGET_ID, ui, REF),
    ];
    const atoms2 = [
      ...buildWidgetAtoms(WIDGET_ID, ui, REF),
      ...buildInputConstraintAtoms(WIDGET_ID, ui, REF),
    ];

    expect(JSON.stringify(atoms1)).toBe(JSON.stringify(atoms2));
  });
});
