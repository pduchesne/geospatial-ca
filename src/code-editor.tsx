import * as React from 'react';

import MonacoEditor, {ChangeHandler} from "react-monaco-editor";
import { useEffect, useMemo, useState} from "react";
import * as monacoEditor from "monaco-editor";
import {editor} from "monaco-editor";

export function CodeEditor(props: {code: string, onCodeChange?: ChangeHandler, height?: string | number}) {

    const [libs, setLibs] = useState<{[key : string] : string}>();

    /*
    const [editor, setEditor] = useState<editor.IStandaloneCodeEditor>();

    const onEditorMount = useMemo(
        () =>
            (editor: editor.IStandaloneCodeEditor) => {
                setEditor(editor);
            },
        []);
        */

    const editorWillMount = (monaco: typeof monacoEditor) => {

        monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ES2016,
            allowNonTsExtensions: true,
            allowJs: true,
            //isolatedModules: true,
            //moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            //typeRoots: ["node_modules/@types"],
            //outDir: "dummy"
        });

        if (libs)
            Object.keys(libs).forEach( (libName) => {
                monaco.languages.typescript.javascriptDefaults.addExtraLib(libs[libName]+`;\nexport as namespace ${libName};`, `inmemory://model/${libName}.d.ts`);
            })

        monaco.languages.typescript.javascriptDefaults.addExtraLib(
            'export declare function add(a: number, b: number): number; export as namespace math;',
            "inmemory://model/math.d.ts"
        );

    };



    const libNames = ["lib", "ca/model", "ca/spatial", "ca/waterflow"];
    useEffect( () => {
            const promises = libNames.map(libName => fetch(libName+".d.ts").then(
                (response) =>
                    response.text()
            ));

            Promise.all(promises).then( (values) => {
                const libsToLoad = {};
                libNames.forEach( (name, idx) => libsToLoad[name] = values[idx]);

                setLibs(libsToLoad);
            } )
        }
        , []);


    const options = useMemo<editor.IEditorConstructionOptions>(() => ( {
        selectOnLineNumbers: true,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: "line",
        automaticLayout: false
    } ), [])

    return libs ? <MonacoEditor
        height={props.height}
        language="javascript"
        value={props.code}
        options={options}
        onChange={props.onCodeChange}
        editorDidMount={ (editor, monaco) => {monaco.editor.getModelMarkers({})} }
        editorWillMount={ editorWillMount }
        theme="vs-dark"
    /> : null;
}
