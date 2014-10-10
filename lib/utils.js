/*
 * Copyright 2014 François de Campredon
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define(function (require, exports) {
    'use strict';
    
    var MainViewManager  = brackets.getModule('view/MainViewManager'),
        DocumentManager  = brackets.getModule('document/DocumentManager');
    
    /**
     * check if a jquery object contains a given position
     * 
     * @param {Jquery} div
     * @param {{clientX: number,  clientY: number}} event
     * @param {number} [precisionX = 0]
     * @param {number} [precisionY = 0]
     */
    function divContainsMouse($div, event, precisionX, precisionY) {
        var offset = $div.offset();

        if (typeof precisionX !== 'number') {
            precisionX = 0;
        }
        if (typeof precisionY !== 'number') {
            precisionY = 0;
        }

        return (event.clientX >= offset.left - precisionX &&
                event.clientX <= offset.left + $div.width() + precisionX &&
                event.clientY >= offset.top - precisionY  &&
                event.clientY <= offset.top + $div.height() + precisionY);
    }
    
    
    /**
     * Compare two codemirror position.
     *  
     * @param {line:number, ch: number} pos1
     * @param {line:number, ch: number} pos2
     * @return {boolean} true if pos1 is inferior or equals to pos 2, false otherwise  
     */
    function isPosInferiorOrEqual(pos1, pos2) {
        // null equals null
        if (!pos1 && !pos2) {
            return true;
        }
        // not null superior to null
        if (pos1 && !pos2) {
            return false;
        }

        //  null inferior to null
        if (!pos1 && pos2) {
            return true;
        }

        //first compare line
        if (pos1.line < pos2.line) {
            return true;
        } else if (pos1.line > pos2.line) {
            return false;
        //compare ch
        } else if (pos1.ch > pos2.ch) {
            return false;
        } else {
            return true;
        }
    }
    
    
        
    /**
     * Retrieve the path of the file associated to a given editor.
     * 
     * @param {Editor} editor
     * @return {string}
     */
    function getEditorFile(editor) {
        return editor.document.file.fullPath;
    }
    
    
    /**
     * Retrieve the editors for a given file path
     * 
     * @param {string} file
     * @return {Editor[]}
     */
    function getEditorsForFile(editors, file) {
        return editors.filter(function (editor) {
            return getEditorFile(editor) === file;
        });
    }
    
    /**
     * Retrieve the path of the file associated to a given lint session
     * 
     * @param {LintSession} lintSession
     * @return {string}
     */
    function getSessionFile(session) {
        return session.document.file.fullPath;
    }
    
    /**
     * retrieve the full editors currently displayed
     * 
     * @return {Array.<Editor>}
     */
    function getFullEditors() {
        return MainViewManager.getPaneIdList().map(function (id) {
            var currentPath = MainViewManager.getCurrentlyViewedPath(id),
                doc = currentPath && DocumentManager.getOpenDocumentForPath(currentPath);

            return doc && doc._masterEditor;
        }).filter(function (editor) {
            return !!editor;
        });
    }
    
    exports.divContainsMouse = divContainsMouse;
    exports.isPosInferiorOrEqual = isPosInferiorOrEqual;
    exports.getEditorFile = getEditorFile;
    exports.getEditorsForFile = getEditorsForFile;
    exports.getSessionFile = getSessionFile;
    exports.getFullEditors = getFullEditors;
    
});
