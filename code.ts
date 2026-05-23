/// <reference types="@figma/plugin-typings" />
// ToneCurve - Color Palette Generator for Figma
// This plugin generates sophisticated color palettes with tone curve controls
// and outputs them as frames, styles, or variables in Figma

interface ColorData {
  step: number;
  name?: string; // Custom name for the color, if provided
  hex: string;
  hsl: number[];
  rgb: number[];
}

interface PaletteMessage {
  type: 'generate-palette';
  outputType: 'frames' | 'styles' | 'variables';
  scaleName: string;
  colors: ColorData[];
  variablesCollectionName?: string;
  frameOptions?: {
    showHSL: boolean;
    showRGB: boolean;
    showContrastWhite: boolean;
    showContrastBlack: boolean;
  };
  isAutoUpdate?: boolean;
}

interface ColorHistoryMessage {
  type: 'load-color-history' | 'save-color-history';
  colorHistory?: string[];
}

interface SavedPalette {
  id: string;
  name: string;
  baseColor: string;
  colors: Array<{
    step: number;
    name?: string;
    hex: string;
  }>;
  timestamp: string;
}

interface SavedPalettesMessage {
  type: 'load-saved-palettes' | 'save-saved-palettes';
  data?: SavedPalette[];
}

interface ExtractColorMessage {
  type: 'extract-selected-color';
}
interface ExtractSelectionColorsMessage {
  type: 'extract-selection-colors';
}
interface LoadVariablesMetadataMessage {
  type: 'load-variables-metadata';
}

interface LoadStylesMetadataMessage {
  type: 'load-styles-metadata';
}

interface ProcessedVariable {
  id: string;
  name: string;
  groupName: string;
  hex: string;
  rgb: number[];
  description: string;
}

interface ProcessedStyle {
  id: string;
  name: string;
  groupName: string;
  hex: string;
  rgb: number[];
  description: string;
}
interface ResizeUIMessage {
  type: 'resize-ui';
  width: number;
  height: number;
}

interface CreateVariablesFromCollectionMessage {
  type: 'create-variables-from-collection';
  collectionData: {
    collectionName: string;
    groups: {
      [groupName: string]: Array<{
        name: string;
        color: string;
      }>;
    };
  };
}
// Font definitions for frame and text generation
const REGULAR_FONT: FontName = { family: "Inter", style: "Regular" };
const MEDIUM_FONT: FontName = { family: "Inter", style: "Medium" };

// Preload fonts before showing UI to avoid delays during frame generation
(async () => {
  await Promise.all([
    figma.loadFontAsync(REGULAR_FONT),
    figma.loadFontAsync(MEDIUM_FONT)
  ]);
  figma.showUI(__html__, { width: 480, height: 600 });
})();

figma.ui.onmessage = async (msg: PaletteMessage | ColorHistoryMessage | SavedPalettesMessage | ExtractColorMessage | ExtractSelectionColorsMessage | LoadVariablesMetadataMessage | LoadStylesMetadataMessage | ResizeUIMessage | CreateVariablesFromCollectionMessage) => {
  if (msg.type === 'generate-palette') {
    const paletteMsg = msg as PaletteMessage;
    try {
      let notificationMessage = '';
      let styleResult: { created: number; updated: number } | undefined;
      let result: { updatedCount: number; createdCount: number } | undefined;
      switch (paletteMsg.outputType) {
        case 'frames': {
          await generateFrames(paletteMsg.scaleName, paletteMsg.colors, paletteMsg.frameOptions, paletteMsg.isAutoUpdate);
          if (!paletteMsg.isAutoUpdate) {
            notificationMessage = `Generated ${paletteMsg.colors.length} colors as ${paletteMsg.outputType}!`;
          }
          break;
        }
        case 'styles': {
          styleResult = await generateStyles(paletteMsg.scaleName, paletteMsg.colors);
          if (!paletteMsg.isAutoUpdate) {
            if (styleResult.created > 0 && styleResult.updated > 0) {
              notificationMessage = `Created ${styleResult.created} and updated ${styleResult.updated} styles!`;
            } else if (styleResult.created > 0) {
              notificationMessage = `Created ${styleResult.created} styles!`;
            } else if (styleResult.updated > 0) {
              notificationMessage = `Updated ${styleResult.updated} styles!`;
            } else {
              notificationMessage = `Generated ${paletteMsg.colors.length} colors as ${paletteMsg.outputType}!`;
            }
          }
          break;
        }
        case 'variables': {
          // Guard against unsupported Variables API
          if (
            typeof figma.variables !== 'object' ||
            typeof figma.variables.getLocalVariableCollectionsAsync !== 'function' ||
            typeof figma.variables.getLocalVariablesAsync !== 'function' ||
            typeof figma.variables.createVariableCollection !== 'function' ||
            typeof figma.variables.createVariable !== 'function'
          ) {
            figma.notify('Variables output is not supported in this Figma environment.', { error: true });
            break;
          }
          result = await generateVariables(paletteMsg.scaleName, paletteMsg.colors, paletteMsg.variablesCollectionName);
          if (!paletteMsg.isAutoUpdate) {
            // Only show notifications for manual variable generation, not auto updates
            if (result.createdCount > 0 && result.updatedCount > 0) {
              notificationMessage = `Created ${result.createdCount} and updated ${result.updatedCount} variables!`;
            } else if (result.createdCount > 0) {
              notificationMessage = `Created ${result.createdCount} variables!`;
            } else if (result.updatedCount > 0) {
              notificationMessage = `Updated ${result.updatedCount} variables!`;
            } else {
              notificationMessage = 'Variables processed!';
            }
          }
          break;
        }
      }
      // Only show notification if it's not an auto update or if we have a message
      if (!paletteMsg.isAutoUpdate && notificationMessage) {
        figma.notify(notificationMessage);
      }
    } catch (error) {
      figma.notify(`Error generating palette: ${error instanceof Error ? error.message : 'Unknown error'}`, { error: true });
    }
  } else if (msg.type === 'load-color-history') {
    // Load color history from client storage
    try {
      const colorHistory = await figma.clientStorage.getAsync('tonecurve-color-history') || [];
      figma.ui.postMessage({
        type: 'color-history-loaded',
        data: colorHistory
      });
    } catch (error) {
      console.error('Error loading color history:', error);
      figma.ui.postMessage({
        type: 'color-history-loaded',
        data: []
      });
    }
  } else if (msg.type === 'save-color-history') {
    // Save color history to client storage
    const historyMsg = msg as ColorHistoryMessage;
    try {
      await figma.clientStorage.setAsync('tonecurve-color-history', historyMsg.colorHistory || []);
    } catch (error) {
      console.error('Error saving color history:', error);
    }
  } else if (msg.type === 'load-saved-palettes') {
    // Load saved palettes from client storage
    try {
      const savedPalettes = await figma.clientStorage.getAsync('tonecurve-saved-palettes') || [];
      figma.ui.postMessage({
        type: 'saved-palettes-loaded',
        data: savedPalettes
      });
    } catch (error) {
      console.error('Error loading saved palettes:', error);
      figma.ui.postMessage({
        type: 'saved-palettes-loaded',
        data: []
      });
    }
  } else if (msg.type === 'save-saved-palettes') {
    // Save saved palettes to client storage
    const palettesMsg = msg as SavedPalettesMessage;
    try {
      await figma.clientStorage.setAsync('tonecurve-saved-palettes', palettesMsg.data || []);
    } catch (error) {
      console.error('Error saving saved palettes:', error);
    }
  } else if (msg.type === 'extract-selected-color') {
    // Extract color from selected element
    try {
      const extractedColor = extractColorFromSelection();
      if (extractedColor) {
        figma.ui.postMessage({
          type: 'selected-color-extracted',
          color: extractedColor
        });
      } else {
        figma.notify('No color found in selected element', { error: true });
      }
    } catch (error) {
      figma.notify(`Error extracting color: ${error instanceof Error ? error.message : 'Unknown error'}`, { error: true });
    }
  } else if (msg.type === 'extract-selection-colors') {
    // Extract multiple colors from selected element(s)
    try {
      const result = extractColorsFromSelection();
      if (result && result.colors.length > 0) {
        figma.ui.postMessage({
          type: 'selection-colors-extracted',
          data: result
        });
      } else {
        figma.notify('No colors found in selected element(s)', { error: true });
      }
    } catch (error) {
      figma.notify(`Error extracting colors: ${error instanceof Error ? error.message : 'Unknown error'}`, { error: true });
    }
  } else if (msg.type === 'load-variables-metadata') {
    try {
      // Guard against unsupported Variables API
      if (
        typeof figma.variables !== 'object' ||
        typeof figma.variables.getLocalVariableCollectionsAsync !== 'function' ||
        typeof figma.variables.getLocalVariablesAsync !== 'function'
      ) {
        figma.ui.postMessage({
          type: 'variables-metadata-loaded',
          collections: [],
          groupsByCollectionId: {}
        });
        return;
      }

      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const variables = await figma.variables.getLocalVariablesAsync('COLOR');

      // Early exit if no variables or collections (optimization)
      if (variables.length === 0 || collections.length === 0) {
        figma.ui.postMessage({
          type: 'variables-metadata-loaded',
          collections: [],
          groupsByCollectionId: {},
          variablesByCollectionId: {}
        });
        return;
      }

      // Create cache key based on variable count and collection structure
      // v4: Added proper support for variable aliases (linked variables)
      const cacheKey = `tonecurve-variables-cache-v4`;
      const cacheValidationKey = `tonecurve-variables-validation-v4`;
      const currentValidation = {
        variableCount: variables.length,
        collectionCount: collections.length,
        collectionIds: collections.map(c => c.id).sort().join(',')
      };

      // Check if we have valid cached data
      try {
        const cachedValidation = await figma.clientStorage.getAsync(cacheValidationKey);
        if (cachedValidation &&
          cachedValidation.variableCount === currentValidation.variableCount &&
          cachedValidation.collectionCount === currentValidation.collectionCount &&
          cachedValidation.collectionIds === currentValidation.collectionIds) {

          // Cache is valid, try to load cached data
          const cachedData = await figma.clientStorage.getAsync(cacheKey);
          if (cachedData) {
            figma.ui.postMessage({
              type: 'variables-metadata-loaded',
              collections: cachedData.collections,
              groupsByCollectionId: cachedData.groupsByCollectionId,
              variablesByCollectionId: cachedData.variablesByCollectionId
            });
            return;
          }
        }
      } catch (cacheError) {
        // Cache read failed, continue with normal processing
        console.log('Cache read failed, processing variables');
      }

      const collectionsPayload = collections.map(c => ({ id: c.id, name: c.name }));
      const groupsByCollectionId: Record<string, Set<string>> = {};
      const variablesByCollectionId: Record<string, ProcessedVariable[]> = {};

      // Build collection and mode lookup maps ONCE before the loop (O(n) instead of O(n×m))
      const collectionMap = new Map<string, VariableCollection>();
      const defaultModeIdMap = new Map<string, string>();

      for (const c of collections) {
        groupsByCollectionId[c.id] = new Set<string>();
        variablesByCollectionId[c.id] = [];
        collectionMap.set(c.id, c);
        if (c.modes.length > 0) {
          defaultModeIdMap.set(c.id, c.modes[0].modeId);
        }
      }

      // Helper to check if a value is a variable alias (with type guard)
      const isVariableAlias = (value: unknown): value is VariableAlias => {
        return typeof value === 'object' && value !== null &&
          ('type' in value && (value as { type: string }).type === 'VARIABLE_ALIAS' ||
           ('id' in value && typeof (value as { id: unknown }).id === 'string' && 
            ((value as { id: string }).id).includes('VariableID')));
      };

      // Helper to check if a value is direct RGB
      const isDirectRGB = (value: any): value is RGB => {
        return typeof value === 'object' && value !== null &&
          'r' in value && 'g' in value && 'b' in value &&
          typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number';
      };

      // PHASE 1: Collect all alias IDs that need resolution
      const aliasIdsToResolve = new Set<string>();
      const variableAliasMap = new Map<string, string>(); // variableId -> aliasId

      for (const v of variables) {
        const collectionId = v.variableCollectionId;
        const defaultModeId = defaultModeIdMap.get(collectionId);
        if (defaultModeId) {
          const rawValue = v.valuesByMode[defaultModeId];
          if (isVariableAlias(rawValue)) {
            aliasIdsToResolve.add(rawValue.id);
            variableAliasMap.set(v.id, rawValue.id);
          }
        }
      }

      // PHASE 2: Batch fetch all referenced variables in parallel
      const BATCH_SIZE = 50;
      const resolvedVariablesMap = new Map<string, Variable | null>();
      const aliasIdsArray = Array.from(aliasIdsToResolve);

      for (let i = 0; i < aliasIdsArray.length; i += BATCH_SIZE) {
        const batch = aliasIdsArray.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (aliasId) => {
            try {
              return await figma.variables.getVariableByIdAsync(aliasId);
            } catch {
              return null;
            }
          })
        );
        batch.forEach((aliasId, idx) => {
          resolvedVariablesMap.set(aliasId, results[idx]);
        });
      }

      // PHASE 3: Batch fetch all collections for resolved variables
      const collectionIdsToFetch = new Set<string>();
      for (const resolvedVar of resolvedVariablesMap.values()) {
        if (resolvedVar && !collectionMap.has(resolvedVar.variableCollectionId)) {
          collectionIdsToFetch.add(resolvedVar.variableCollectionId);
        }
      }

      const externalCollectionMap = new Map<string, VariableCollection | null>();
      const collectionIdsArray = Array.from(collectionIdsToFetch);

      for (let i = 0; i < collectionIdsArray.length; i += BATCH_SIZE) {
        const batch = collectionIdsArray.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (collId) => {
            try {
              return await figma.variables.getVariableCollectionByIdAsync(collId);
            } catch {
              return null;
            }
          })
        );
        batch.forEach((collId, idx) => {
          externalCollectionMap.set(collId, results[idx]);
        });
      }

      // PHASE 4: Build resolved color cache with recursive alias support
      const resolvedColorCache = new Map<string, RGB | null>();

      const resolveAliasToColor = (aliasId: string, visited = new Set<string>()): RGB | null => {
        // Check cache first
        if (resolvedColorCache.has(aliasId)) {
          return resolvedColorCache.get(aliasId)!;
        }

        // Prevent circular references
        if (visited.has(aliasId)) {
          return null;
        }
        visited.add(aliasId);

        const referencedVar = resolvedVariablesMap.get(aliasId);
        if (!referencedVar) {
          resolvedColorCache.set(aliasId, null);
          return null;
        }

        // Get collection (check both local and external)
        const refCollection = collectionMap.get(referencedVar.variableCollectionId) ||
                              externalCollectionMap.get(referencedVar.variableCollectionId);

        // Try to get the value from various modes
        let referencedValue: any;
        const modeIds = Object.keys(referencedVar.valuesByMode);

        if (refCollection && refCollection.modes.length > 0) {
          const refDefaultModeId = refCollection.modes[0].modeId;
          referencedValue = referencedVar.valuesByMode[refDefaultModeId];
        }

        if (referencedValue === undefined && modeIds.length > 0) {
          referencedValue = referencedVar.valuesByMode[modeIds[0]];
        }

        if (!referencedValue) {
          resolvedColorCache.set(aliasId, null);
          return null;
        }

        // If direct RGB, return it
        if (isDirectRGB(referencedValue)) {
          resolvedColorCache.set(aliasId, referencedValue);
          return referencedValue;
        }

        // If another alias, resolve recursively
        if (isVariableAlias(referencedValue)) {
          // Need to fetch this nested alias if not already fetched
          if (!resolvedVariablesMap.has(referencedValue.id)) {
            // This alias wasn't pre-fetched, return null (rare edge case)
            resolvedColorCache.set(aliasId, null);
            return null;
          }
          const result = resolveAliasToColor(referencedValue.id, visited);
          resolvedColorCache.set(aliasId, result);
          return result;
        }

        resolvedColorCache.set(aliasId, null);
        return null;
      };

      // Pre-resolve all aliases
      for (const aliasId of aliasIdsToResolve) {
        resolveAliasToColor(aliasId);
      }

      // PHASE 5: Process all variables using the pre-resolved cache
      for (const v of variables) {
        const collectionId = v.variableCollectionId;
        if (!groupsByCollectionId[collectionId]) {
          groupsByCollectionId[collectionId] = new Set<string>();
          variablesByCollectionId[collectionId] = [];
        }

        // Extract the full group path (all segments except the last one which is the variable name)
        // e.g., "Additional/Stamp/primary" -> "Additional/Stamp"
        const nameParts = (v.name || '').split('/');
        const groupName = nameParts.length > 1 ? nameParts.slice(0, -1).join('/') : '';
        if (groupName) groupsByCollectionId[collectionId].add(groupName);

        // Get the color value from the default mode using pre-built maps
        const defaultModeId = defaultModeIdMap.get(collectionId);
        if (defaultModeId) {
          const rawColorValue = v.valuesByMode[defaultModeId];

          // Resolve the color value using cache (no async calls needed)
          let colorValue: RGB | null = null;
          if (isDirectRGB(rawColorValue)) {
            colorValue = rawColorValue;
          } else if (isVariableAlias(rawColorValue)) {
            colorValue = resolvedColorCache.get(rawColorValue.id) || null;
          }

          if (colorValue) {
            // Convert Figma RGB to hex
            const r = Math.round(colorValue.r * 255);
            const g = Math.round(colorValue.g * 255);
            const b = Math.round(colorValue.b * 255);
            const hex = '#' + [r, g, b].map(x => {
              const hexVal = x.toString(16);
              return hexVal.length === 1 ? '0' + hexVal : hexVal;
            }).join('');

            variablesByCollectionId[collectionId].push({
              id: v.id,
              name: v.name,
              groupName: groupName,
              hex: hex,
              rgb: [r, g, b],
              description: v.description || ''
            });
          }
        }
      }

      const groupsByCollectionIdPlain: Record<string, string[]> = {};
      for (const key of Object.keys(groupsByCollectionId)) {
        groupsByCollectionIdPlain[key] = Array.from(groupsByCollectionId[key]).sort((a, b) => a.localeCompare(b));
      }

      // Cache the processed data for future use
      const dataToCache = {
        collections: collectionsPayload,
        groupsByCollectionId: groupsByCollectionIdPlain,
        variablesByCollectionId: variablesByCollectionId
      };

      try {
        await figma.clientStorage.setAsync(cacheKey, dataToCache);
        await figma.clientStorage.setAsync(cacheValidationKey, currentValidation);
      } catch (cacheError) {
        // Cache write failed, but continue (non-critical)
        console.log('Cache write failed:', cacheError);
      }

      figma.ui.postMessage({
        type: 'variables-metadata-loaded',
        collections: collectionsPayload,
        groupsByCollectionId: groupsByCollectionIdPlain,
        variablesByCollectionId: variablesByCollectionId
      });
    } catch (error) {
      console.error('Error loading variables metadata:', error);
      figma.ui.postMessage({
        type: 'variables-metadata-loaded',
        collections: [],
        groupsByCollectionId: {}
      });
    }
  } else if (msg.type === 'load-styles-metadata') {
    try {
      console.log('Loading styles metadata...');
      const styles = await figma.getLocalPaintStylesAsync();
      console.log(`Found ${styles.length} total paint styles`);

      // Early exit if no styles
      if (styles.length === 0) {
        console.log('No styles found, sending empty response');
        figma.ui.postMessage({
          type: 'styles-metadata-loaded',
          stylesByGroup: {}
        });
        return;
      }

      // Log first few style names and types for debugging
      console.log('Sample styles:', styles.slice(0, 5).map(s => ({
        name: s.name,
        paintCount: s.paints.length,
        firstPaintType: s.paints[0]?.type
      })));

      // Group styles by their prefix (group name)
      const stylesByGroup: Record<string, ProcessedStyle[]> = {};
      let processedCount = 0;
      let skippedCount = 0;

      for (const style of styles) {
        // Skip if no paints
        if (!style.paints || style.paints.length === 0) {
          skippedCount++;
          continue;
        }

        // Only process SOLID paint styles
        const firstPaint = style.paints[0];
        if (firstPaint.type !== 'SOLID') {
          skippedCount++;
          continue;
        }

        const paint = firstPaint as SolidPaint;

        // Skip if paint is not visible (opacity 0 or visible: false)
        if (paint.visible === false || (paint.opacity !== undefined && paint.opacity === 0)) {
          skippedCount++;
          continue;
        }

        // Extract group name from style name (before first '/')
        // If no '/', use the full name as group name
        const styleName = style.name || '';
        const groupName = styleName.includes('/')
          ? styleName.split('/')[0].trim() || 'Ungrouped'
          : (styleName.trim() || 'Ungrouped');

        if (!stylesByGroup[groupName]) {
          stylesByGroup[groupName] = [];
        }

        // Convert Figma RGB to hex
        // Note: opacity is handled separately, we just use the base color
        const r = Math.round(paint.color.r * 255);
        const g = Math.round(paint.color.g * 255);
        const b = Math.round(paint.color.b * 255);
        const hex = '#' + [r, g, b].map(x => {
          const hexVal = Math.max(0, Math.min(255, x)).toString(16);
          return hexVal.length === 1 ? '0' + hexVal : hexVal;
        }).join('');

        stylesByGroup[groupName].push({
          id: style.id,
          name: style.name,
          groupName: groupName,
          hex: hex,
          rgb: [r, g, b],
          description: style.description || ''
        });

        processedCount++;
      }

      // Sort styles within each group by name
      for (const groupName in stylesByGroup) {
        stylesByGroup[groupName].sort((a, b) => a.name.localeCompare(b.name));
      }

      // Log for debugging
      console.log(`Processed ${processedCount} styles, skipped ${skippedCount} non-solid styles`);
      console.log('Sending styles-metadata-loaded message with groups:', Object.keys(stylesByGroup).length);
      console.log('Sample groups:', Object.keys(stylesByGroup).slice(0, 3));

      figma.ui.postMessage({
        type: 'styles-metadata-loaded',
        stylesByGroup: stylesByGroup
      });

      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error loading styles metadata:', error);
      figma.ui.postMessage({
        type: 'styles-metadata-loaded',
        stylesByGroup: {}
      });
    }
  } else if (msg.type === 'create-variables-from-collection') {
    const collectionMsg = msg as CreateVariablesFromCollectionMessage;
    try {
      // Guard against unsupported Variables API
      if (
        typeof figma.variables !== 'object' ||
        typeof figma.variables.getLocalVariableCollectionsAsync !== 'function' ||
        typeof figma.variables.createVariableCollection !== 'function' ||
        typeof figma.variables.createVariable !== 'function'
      ) {
        figma.notify('Variables are not supported in this Figma environment.', { error: true });
        return;
      }

      const { collectionName, groups } = collectionMsg.collectionData;

      // Get or create the collection
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      let collection = collections.find(c => c.name === collectionName);

      if (!collection) {
        collection = figma.variables.createVariableCollection(collectionName);
      }

      // Get the default mode ID
      const modeId = collection.modes[0].modeId;

      let createdCount = 0;
      let updatedCount = 0;

      // Helper function to convert hex to RGB
      const hexToRgbColor = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ] : [0, 0, 0];
      };

      // Process each group
      const groupEntries = Object.keys(groups).map(key => [key, groups[key]] as [string, Array<{ name: string; color: string }>]);
      for (const [groupName, variables] of groupEntries) {
        for (const variable of variables) {
          const variableName = `${groupName}/${variable.name}`;

          // Check if variable exists
          const existingVariables = await figma.variables.getLocalVariablesAsync();
          let figmaVariable = existingVariables.find(
            v => v.name === variableName && v.variableCollectionId === collection!.id
          );

          // Parse color
          const hex = variable.color;
          const rgb = hexToRgbColor(hex);
          const r = rgb[0] / 255;
          const g = rgb[1] / 255;
          const b = rgb[2] / 255;

          if (figmaVariable) {
            // Update existing variable
            figmaVariable.setValueForMode(modeId, { r, g, b });
            updatedCount++;
          } else {
            // Create new variable
            figmaVariable = figma.variables.createVariable(
              variableName,
              collection!,
              'COLOR'
            );
            figmaVariable.setValueForMode(modeId, { r, g, b });
            createdCount++;
          }
        }
      }

      // Show notification
      if (createdCount > 0 && updatedCount > 0) {
        figma.notify(`Created ${createdCount} and updated ${updatedCount} variables in "${collectionName}"!`);
      } else if (createdCount > 0) {
        figma.notify(`Created ${createdCount} variables in "${collectionName}"!`);
      } else if (updatedCount > 0) {
        figma.notify(`Updated ${updatedCount} variables in "${collectionName}"!`);
      } else {
        figma.notify(`No variables were created or updated.`);
      }
    } catch (error) {
      figma.notify(`Error creating variables: ${error}`, { error: true });
      // eslint-disable-next-line no-console
      console.error('Error creating variables from collection:', error);
    }
  } else if (msg.type === 'resize-ui') {
    try {
      const resizeMsg = msg as ResizeUIMessage;
      const minWidth = 320;
      const minHeight = 400;
      const maxWidth = 1600;
      const maxHeight = 1400;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(resizeMsg.width)));
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(resizeMsg.height)));
      figma.ui.resize(clampedWidth, clampedHeight);
    } catch (error) {
      // Silently ignore resize errors
      // eslint-disable-next-line no-console
      console.error('Error resizing UI:', error);
    }
  }
};

// Extract color from currently selected element
function extractColorFromSelection(): string | null {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Please select an element first', { error: true });
    return null;
  }

  const node = selection[0];

  // Check if node has fills (priority 1: fill color)
  if ('fills' in node && node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];

    if (fill.type === 'SOLID' && fill.visible !== false) {
      return figmaRGBToHex(fill.color);
    } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL' || fill.type === 'GRADIENT_ANGULAR' || fill.type === 'GRADIENT_DIAMOND') {
      // For gradients, return the first gradient stop color
      if (fill.gradientStops && fill.gradientStops.length > 0) {
        return figmaRGBToHex(fill.gradientStops[0].color);
      }
    }
  }

  // Check if node has strokes (priority 2: stroke color)
  if ('strokes' in node && node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];

    if (stroke.type === 'SOLID' && stroke.visible !== false) {
      return figmaRGBToHex(stroke.color);
    } else if (stroke.type === 'GRADIENT_LINEAR' || stroke.type === 'GRADIENT_RADIAL' || stroke.type === 'GRADIENT_ANGULAR' || stroke.type === 'GRADIENT_DIAMOND') {
      // For gradient strokes, return the first gradient stop color
      if (stroke.gradientStops && stroke.gradientStops.length > 0) {
        return figmaRGBToHex(stroke.gradientStops[0].color);
      }
    }
  }

  return null;
}

// Extract multiple colors from selected element(s)
function extractColorsFromSelection(): { colors: string[]; nodeName: string } | null {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Please select an element first', { error: true });
    return null;
  }

  const colors: string[] = [];
  const colorSet = new Set<string>(); // To avoid duplicates
  let nodeName = selection[0].name;

  // Helper function to extract colors from a single node
  function extractColorsFromNode(node: SceneNode) {
    // Check fills
    if ('fills' in node && node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.visible !== false) {
          const hex = figmaRGBToHex(fill.color);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push(hex);
          }
        } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL' ||
          fill.type === 'GRADIENT_ANGULAR' || fill.type === 'GRADIENT_DIAMOND') {
          // Extract all gradient stop colors
          if (fill.gradientStops) {
            for (const stop of fill.gradientStops) {
              const hex = figmaRGBToHex(stop.color);
              if (!colorSet.has(hex)) {
                colorSet.add(hex);
                colors.push(hex);
              }
            }
          }
        }
      }
    }

    // Check strokes
    if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.visible !== false) {
          const hex = figmaRGBToHex(stroke.color);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push(hex);
          }
        } else if (stroke.type === 'GRADIENT_LINEAR' || stroke.type === 'GRADIENT_RADIAL' ||
          stroke.type === 'GRADIENT_ANGULAR' || stroke.type === 'GRADIENT_DIAMOND') {
          if (stroke.gradientStops) {
            for (const stop of stroke.gradientStops) {
              const hex = figmaRGBToHex(stop.color);
              if (!colorSet.has(hex)) {
                colorSet.add(hex);
                colors.push(hex);
              }
            }
          }
        }
      }
    }

    // Recursively check children if it's a container
    if ('children' in node) {
      for (const child of node.children) {
        extractColorsFromNode(child);
      }
    }
  }

  // Extract colors from all selected nodes
  for (const node of selection) {
    extractColorsFromNode(node);
  }

  if (colors.length === 0) {
    return null;
  }

  // If multiple nodes selected, use a generic name
  if (selection.length > 1) {
    nodeName = `Selection (${selection.length} items)`;
  }

  return { colors, nodeName };
}

// Convert Figma RGB to hex
function figmaRGBToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Convert hex color to Figma RGB format
function hexToFigmaRGB(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

// Calculate contrast ratio between two hex colors
function calculateContrastRatio(color1: string, color2: string): number {
  function getLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const sRGB = [r, g, b].map(val => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  const luminance1 = getLuminance(color1);
  const luminance2 = getLuminance(color2);

  const brightest = Math.max(luminance1, luminance2);
  const darkest = Math.min(luminance1, luminance2);

  return (brightest + 0.05) / (darkest + 0.05);
}

// --- Frame Generation Constants ---
const FRAME_PADDING = 24;
const FRAME_SPACING = 16;
const FRAME_BACKGROUND: RGB = { r: 0.98, g: 0.98, b: 0.99 };
const FRAME_CORNER_RADIUS = 12;

const SWATCH_SIZE = 60;
const SWATCH_CORNER_RADIUS = 8;
const SWATCH_SPACING = 4;

// Create a single color swatch with its labels
function createSwatchGroup(scaleName: string, color: ColorData, frameOptions?: Record<string, boolean>): FrameNode {
  // Create swatch container
  const swatchGroup = figma.createFrame();
  const colorName = color.name || color.step;
  swatchGroup.name = `${scaleName}-${colorName}`;
  swatchGroup.layoutMode = 'VERTICAL';
  swatchGroup.primaryAxisSizingMode = 'AUTO';
  swatchGroup.counterAxisSizingMode = 'AUTO';
  swatchGroup.itemSpacing = SWATCH_SPACING;
  swatchGroup.fills = [];

  // Create color swatch
  const swatch = figma.createRectangle();
  swatch.name = `${scaleName}-${colorName}`;
  swatch.resize(SWATCH_SIZE, SWATCH_SIZE);
  swatch.cornerRadius = SWATCH_CORNER_RADIUS;
  swatch.fills = [{ type: 'SOLID', color: hexToFigmaRGB(color.hex) }];

  // Add stroke for light colors
  const lightness = color.hsl[2];
  if (lightness > 90) {
    swatch.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    swatch.strokeWeight = 1;
  }

  // Create step label
  const label = figma.createText();
  label.fontName = REGULAR_FONT;
  label.characters = colorName.toString();
  label.fontSize = 12;
  label.textAlignHorizontal = 'CENTER';
  label.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  label.resize(SWATCH_SIZE, label.height);

  // Create hex value label
  const hexLabel = figma.createText();
  hexLabel.fontName = REGULAR_FONT;
  hexLabel.characters = color.hex.toUpperCase();
  hexLabel.fontSize = 10;
  hexLabel.textAlignHorizontal = 'CENTER';
  hexLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  hexLabel.resize(SWATCH_SIZE, hexLabel.height);

  swatchGroup.appendChild(swatch);
  swatchGroup.appendChild(label);
  swatchGroup.appendChild(hexLabel);

  // Add optional information based on frame options
  if (frameOptions) {
    // Add HSL information
    if (frameOptions.showHSL) {
      const hslLabel = figma.createText();
      hslLabel.fontName = REGULAR_FONT;
      hslLabel.characters = `HSL(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
      hslLabel.fontSize = 9;
      hslLabel.textAlignHorizontal = 'CENTER';
      hslLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      hslLabel.resize(SWATCH_SIZE, hslLabel.height);
      swatchGroup.appendChild(hslLabel);
    }

    // Add RGB information
    if (frameOptions.showRGB) {
      const rgbLabel = figma.createText();
      rgbLabel.fontName = REGULAR_FONT;
      rgbLabel.characters = `RGB(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
      rgbLabel.fontSize = 9;
      rgbLabel.textAlignHorizontal = 'CENTER';
      rgbLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      rgbLabel.resize(SWATCH_SIZE, rgbLabel.height);
      swatchGroup.appendChild(rgbLabel);
    }

    // Add contrast information
    if (frameOptions.showContrastWhite || frameOptions.showContrastBlack) {
      if (frameOptions.showContrastWhite) {
        const contrastWhite = calculateContrastRatio(color.hex, '#FFFFFF');
        const whiteLabel = figma.createText();
        whiteLabel.fontName = REGULAR_FONT;
        whiteLabel.characters = `On White: ${contrastWhite.toFixed(2)}`;
        whiteLabel.fontSize = 9;
        whiteLabel.textAlignHorizontal = 'CENTER';
        whiteLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
        whiteLabel.resize(SWATCH_SIZE, whiteLabel.height);
        swatchGroup.appendChild(whiteLabel);
      }

      if (frameOptions.showContrastBlack) {
        const contrastBlack = calculateContrastRatio(color.hex, '#000000');
        const blackLabel = figma.createText();
        blackLabel.fontName = REGULAR_FONT;
        blackLabel.characters = `On Black: ${contrastBlack.toFixed(2)}`;
        blackLabel.fontSize = 9;
        blackLabel.textAlignHorizontal = 'CENTER';
        blackLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
        blackLabel.resize(SWATCH_SIZE, blackLabel.height);
        swatchGroup.appendChild(blackLabel);
      }
    }
  }

  return swatchGroup;
}

// Create the main title for the palette frame
function createFrameTitle(scaleName: string): TextNode {
  const title = figma.createText();
  title.fontName = MEDIUM_FONT;
  title.characters = scaleName.charAt(0).toUpperCase() + scaleName.slice(1);
  title.fontSize = 16;
  title.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  return title;
}

// Position the generated frame based on current selection and viewport
function positionFrame(frame: FrameNode): void {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    // No selection: center in current viewport
    const viewport = figma.viewport.center;
    frame.x = viewport.x - frame.width / 2;
    frame.y = viewport.y - frame.height / 2;
    return;
  }

  const selectedNode = selection[0];

  if (selectedNode.type === 'SECTION') {
    // Section selected: place in top left corner with padding
    frame.x = selectedNode.x + 24;
    frame.y = selectedNode.y + 24;
  } else {
    // Other node selected: place below with gap
    // Get the absolute position of the selected node in the page coordinate system
    const absoluteX = selectedNode.absoluteTransform[0][2];
    const absoluteY = selectedNode.absoluteTransform[1][2];

    frame.x = absoluteX;
    frame.y = absoluteY + selectedNode.height + 24;
  }
}

// Generate color palette as frames with swatches
async function generateFrames(scaleName: string, colors: ColorData[], frameOptions?: Record<string, boolean>, isAutoUpdate?: boolean): Promise<void> {
  const frameIdKey = `tonecurve-frame-id-${scaleName}`;
  let mainFrame: FrameNode | null = null;
  let createdNewFrame = false;

  // 1. Try to find frame by stored ID
  const storedFrameId = await figma.clientStorage.getAsync(frameIdKey);
  if (storedFrameId) {
    mainFrame = await figma.getNodeByIdAsync(storedFrameId) as FrameNode;
    // Check if the node was deleted
    if (!mainFrame || mainFrame.removed) {
      mainFrame = null;
    }
  }

  // For auto-update, if no frame exists, do nothing.
  if (isAutoUpdate && !mainFrame) {
    return;
  }

  // 3. If still no frame, create a new one
  if (!mainFrame) {
    mainFrame = figma.createFrame();
    mainFrame.name = `${scaleName} Palette`;
    mainFrame.layoutMode = 'VERTICAL';
    mainFrame.primaryAxisSizingMode = 'AUTO';
    mainFrame.counterAxisSizingMode = 'AUTO';
    mainFrame.itemSpacing = FRAME_SPACING;
    mainFrame.paddingTop = FRAME_PADDING;
    mainFrame.paddingRight = FRAME_PADDING;
    mainFrame.paddingBottom = FRAME_PADDING;
    mainFrame.paddingLeft = FRAME_PADDING;
    mainFrame.fills = [{ type: 'SOLID', color: FRAME_BACKGROUND }];
    mainFrame.cornerRadius = FRAME_CORNER_RADIUS;

    // Add to page and store new ID
    figma.currentPage.appendChild(mainFrame);
    await figma.clientStorage.setAsync(frameIdKey, mainFrame.id);
    createdNewFrame = true;
  }

  // At this point, mainFrame is guaranteed to be a valid, existing frame

  // 4. Clear existing content and add/update title and swatches
  mainFrame.children.forEach(child => child.remove());

  // Add title
  const title = createFrameTitle(scaleName);
  mainFrame.appendChild(title);

  // Add swatch container and swatches
  const swatchContainer = figma.createFrame();
  swatchContainer.name = 'Swatches';
  swatchContainer.layoutMode = 'HORIZONTAL';
  swatchContainer.primaryAxisSizingMode = 'AUTO';
  swatchContainer.counterAxisSizingMode = 'AUTO';
  swatchContainer.itemSpacing = SWATCH_SPACING;
  swatchContainer.fills = [];

  // Create swatches sequentially to avoid overwhelming the engine
  for (const color of colors) {
    const swatchNode = createSwatchGroup(scaleName, color, frameOptions);
    swatchContainer.appendChild(swatchNode);
  }

  mainFrame.appendChild(swatchContainer);

  // 5. Position the frame based on selection and viewport
  if (!isAutoUpdate && createdNewFrame) {
    positionFrame(mainFrame);
    figma.currentPage.selection = [mainFrame];
  }
}

// Generate color palette as Figma paint styles
async function generateStyles(scaleName: string, colors: ColorData[]): Promise<{ created: number, updated: number }> {
  let created = 0;
  let updated = 0;
  const localStyles = await figma.getLocalPaintStylesAsync();
  for (const color of colors) {
    const colorName = color.name || color.step;
    const styleName = `${scaleName}/${colorName}`;
    const existingStyle = localStyles.find(s => s.name === styleName);
    if (existingStyle) {
      // Update existing style
      existingStyle.description = `${color.hex} - hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
      existingStyle.paints = [{ type: 'SOLID', color: hexToFigmaRGB(color.hex) }];
      updated++;
    } else {
      // Create new style
      const style = figma.createPaintStyle();
      style.name = styleName;
      style.description = `${color.hex} - hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
      style.paints = [{ type: 'SOLID', color: hexToFigmaRGB(color.hex) }];
      created++;
    }
  }
  return { created, updated };
}

// Generate color palette as Figma variables
async function generateVariables(scaleName: string, colors: ColorData[], collectionName?: string): Promise<{ updatedCount: number, createdCount: number }> {
  // Defensive check for Variables API support
  if (
    typeof figma.variables !== 'object' ||
    typeof figma.variables.getLocalVariableCollectionsAsync !== 'function' ||
    typeof figma.variables.getLocalVariablesAsync !== 'function' ||
    typeof figma.variables.createVariableCollection !== 'function' ||
    typeof figma.variables.createVariable !== 'function'
  ) {
    figma.notify('Variables API not supported in this Figma environment.', { error: true });
    return { updatedCount: 0, createdCount: 0 };
  }
  // Create or get the color collection
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const finalCollectionName = collectionName || 'Colors';
  let collection = collections.find(
    c => c.name === finalCollectionName
  );
  if (!collection) {
    collection = figma.variables.createVariableCollection(finalCollectionName);
  }
  // Get the default mode
  const defaultMode = collection.modes[0];
  let updatedCount = 0;
  let createdCount = 0;
  for (const color of colors) {
    const colorName = color.name || color.step;
    const variableName = `${scaleName}/${colorName}`;
    // Get fresh list of variables for each iteration to avoid race conditions
    const allVariables = await figma.variables.getLocalVariablesAsync('COLOR');
    // Check if variable already exists in this specific collection
    let variable = allVariables.find(v =>
      v.name === variableName && v.variableCollectionId === collection.id
    );
    if (variable) {
      // Update existing variable
      const figmaColor = hexToFigmaRGB(color.hex);
      variable.setValueForMode(defaultMode.modeId, figmaColor);
      variable.description = `${color.hex} - hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
      updatedCount++;
    } else {
      // Create new variable
      try {
        variable = figma.variables.createVariable(
          variableName,
          collection,
          'COLOR'
        );
        // Set the color value
        const figmaColor = hexToFigmaRGB(color.hex);
        variable.setValueForMode(defaultMode.modeId, figmaColor);
        // Set description
        variable.description = `${color.hex} - hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
        createdCount++;
      } catch (error) {
        // If creation fails due to duplicate name, try to find and update the existing one
        if (error instanceof Error && error.message && error.message.includes('duplicate')) {
          const doubleCheck = await figma.variables.getLocalVariablesAsync('COLOR');
          const existingVariable = doubleCheck.find(v =>
            v.name === variableName && v.variableCollectionId === collection.id
          );
          if (existingVariable) {
            const figmaColor = hexToFigmaRGB(color.hex);
            existingVariable.setValueForMode(defaultMode.modeId, figmaColor);
            existingVariable.description = `${color.hex} - hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
            updatedCount++;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
  }
  return { updatedCount, createdCount };
}
