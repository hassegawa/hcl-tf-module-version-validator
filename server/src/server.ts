/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	InsertTextFormat,
	type DocumentDiagnosticReport,
	//DiagnosticTag
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
//import { deprecate } from 'util';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface HclVersionSettings {
	maxNumberOfProblems: number;
	listOfVersionsPath: string;
	regexFindModuleVersion: string;
	regexMatchPosition: number;
	regexModuleNamePosition: number;
	regexModuleVersionPosition: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: HclVersionSettings = { maxNumberOfProblems: 1000, 
	listOfVersionsPath: "c:/", 
	regexFindModuleVersion: "/TERRAFORM-MODULES\\/([^?]+)\\?ref=(\\d+\\.\\d+\\.\\d+)/g",
	regexMatchPosition: 0,
	regexModuleNamePosition: 1,
	regexModuleVersionPosition: 2
 };
let globalSettings: HclVersionSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<HclVersionSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.languageServerHclVersion || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<HclVersionSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerHclVersion'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

type JsonData = Record<string, { tags: Record<string, {  deprecated:string }>; url: string }>;

const validCompletionItem : CompletionItem[] = [];
let jsonData: JsonData | null = null;
let fileDate: string;

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);
	const diagnostics: Diagnostic[] = [];

	if (!jsonData) {
		if (fs.existsSync(settings.listOfVersionsPath)) {
			const data = fs.readFileSync(settings.listOfVersionsPath, 'utf-8');
			jsonData = JSON.parse(data);

			fileDate = new Date(fs.statSync(settings.listOfVersionsPath).mtimeMs).toDateString();
		} else {
		    const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(0),
					end: textDocument.positionAt(1)
				},
				message: `file does not exist: ${settings.listOfVersionsPath} `,
				source: 'hcl file'
			};
            diagnostics.push(diagnostic);	

			return diagnostics;
		}
	}

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = new RegExp(settings.regexFindModuleVersion, "g");

    const modules = [...text.matchAll(pattern)];

    modules.forEach((module) => {
		const moduleVersion = jsonData![module[settings.regexModuleNamePosition]];

		if (moduleVersion) {

			const tags = moduleVersion.tags;

			const validVersions = Object.entries(tags)
				.filter(([_, value]) => !value.deprecated) // Filtra onde deprecated = false
				.map(([version, _]) => version);

			//console.log(validVersions);

			if (!validCompletionItem.find(i => i.label == module[settings.regexModuleNamePosition])) {
				const tagsString = validVersions.join(',');

				validCompletionItem.push({
					label: module[settings.regexModuleNamePosition],
					detail: 'TF Module versions',
					kind: CompletionItemKind.Text,
					data: validCompletionItem.length + 1,
					insertTextFormat: InsertTextFormat.Snippet,
					insertText: `\${1|${tagsString}|}`,
					documentation: moduleVersion.url
				});
			}

			if (!validVersions.includes(module[settings.regexModuleVersionPosition])) {
					
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Warning,
					range: {
						start: textDocument.positionAt(module.index + module[settings.regexMatchPosition].length - module[settings.regexModuleVersionPosition].length),
						end: textDocument.positionAt(module.index + module[settings.regexMatchPosition].length)
					},
					message: `module: ${module[settings.regexModuleNamePosition]} version ${module[settings.regexModuleVersionPosition]} is deprecad.`,
					source: 'hcl file'
				};
				if (hasDiagnosticRelatedInformationCapability) {
					diagnostic.relatedInformation = [
						{
							location: {
								uri: textDocument.uri,
								range: Object.assign({}, diagnostic.range)
							},
							message: `module detail, url: ${moduleVersion.url} \n\n file version ref: ${settings.listOfVersionsPath}, date: ${fileDate}`
						}
					];
				}
				diagnostics.push(diagnostic);
			}
		} else {
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(module.index),
					end: textDocument.positionAt(module.index + module[settings.regexMatchPosition].length)
				},
				message: `module: ${module[settings.regexModuleNamePosition]} does not exist in the file : ${settings.listOfVersionsPath} `,
				source: 'hcl file'
			};
            diagnostics.push(diagnostic);
		}
	});
	return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
        

		return validCompletionItem;
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
