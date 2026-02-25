/**
 * decorator-parser.ts
 * Parses Angular @Component decorator metadata deterministically.
 *
 * Precedence rule (deterministic):
 *   If both `template` (inline) and `templateUrl` exist, inline wins.
 *
 * Filesystem access is bounded to projectRoot.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Decorator } from 'ts-morph';
import type { Origin } from '../../models/origin.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import { TsAstUtils } from '../ts/ts-ast-utils.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ComponentMeta {
  selector: string | null;
  /** Inline template string if defined directly in the decorator. */
  templateInline: string | null;
  /** Path to external template file as written in templateUrl. */
  templateUrl: string | null;
  styleUrls: string[];
  /** Origin of the @Component decorator itself. */
  origin: Origin;
  /** Origin of the inline template span, if available. */
  templateOrigin?: Origin;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class DecoratorParser {
  /**
   * Extract @Component metadata from a decorator node.
   * All string values are bounded by cfg.maxTemplateSnippetLength for snippets.
   */
  static extractComponentMeta(decorator: Decorator, cfg: AnalyzerConfig): ComponentMeta {
    const maxLen = cfg.maxTemplateSnippetLength ?? 200;
    const origin = TsAstUtils.getOrigin(decorator, decorator.getName());

    const args = decorator.getArguments();
    const configArg = args.at(0);

    if (configArg === undefined) {
      return { selector: null, templateInline: null, templateUrl: null, styleUrls: [], origin };
    }

    let selector: string | null = null;
    let templateInline: string | null = null;
    let templateUrl: string | null = null;
    let styleUrls: string[] = [];
    let templateOrigin: Origin | undefined;

    // Walk object literal properties
    for (const child of configArg.getChildren()) {
      for (const prop of child.getChildren()) {
        const text = prop.getText();
        if (text.startsWith('selector')) {
          const val = prop.getChildren().at(-1);
          if (val !== undefined) selector = TsAstUtils.getStringLiteralValue(val);
        } else if (text.startsWith('templateUrl')) {
          const val = prop.getChildren().at(-1);
          if (val !== undefined) templateUrl = TsAstUtils.getStringLiteralValue(val);
        } else if (text.startsWith('template')) {
          const val = prop.getChildren().at(-1);
          if (val !== undefined) {
            const raw = TsAstUtils.getStringLiteralValue(val);
            if (raw !== null) {
              templateInline = raw;
              templateOrigin = TsAstUtils.getOrigin(val, 'template');
            }
          }
        } else if (text.startsWith('styleUrls')) {
          const val = prop.getChildren().at(-1);
          if (val !== undefined) {
            styleUrls = TsAstUtils.extractArrayOfStringLiterals(val);
          }
        }
      }
    }

    void maxLen; // truncation applied when building Origin snippets elsewhere

    const result: ComponentMeta = { selector, templateInline, templateUrl, styleUrls, origin };
    if (templateOrigin !== undefined) result.templateOrigin = templateOrigin;
    return result;
  }

  /**
   * Resolve the actual template text for a component.
   * Applies the deterministic precedence rule: inline > templateUrl.
   * Returns null if neither is available.
   *
   * Filesystem access is restricted to within projectRoot.
   */
  static resolveTemplateText(meta: ComponentMeta, projectRoot: string): string | null {
    // Precedence: inline wins
    if (meta.templateInline !== null) return meta.templateInline;

    if (meta.templateUrl !== null) {
      // Resolve relative to the component file's directory if origin.file is available,
      // otherwise fall back to projectRoot.
      const baseDir = meta.origin.file
        ? path.dirname(meta.origin.file)
        : projectRoot;
      const resolved = path.resolve(baseDir, meta.templateUrl);

      // Restrict to projectRoot
      if (!resolved.startsWith(path.resolve(projectRoot))) {
        return null;
      }

      try {
        return fs.readFileSync(resolved, 'utf-8');
      } catch {
        return null;
      }
    }

    return null;
  }
}
