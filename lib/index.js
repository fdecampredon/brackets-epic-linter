define(function (require, exports) {
    'use strict';
    
    
    // Import ----------------------------------------------
    
    var EditorManager    = brackets.getModule('editor/EditorManager');
    
    
    var LintSession = require('./lintSession'),
        errorsMarks = require('./errorsMarks'),
        errorToolTip = require('./errorToolTip'),
        utils = require('./utils'),
        errorsTick  = require('./errorsTick');
    
    
    
    /**
     * @private
     * Map of the currently managed LintSession
     * 
     * @type {Object.<string, LintSession>}
     */
    var lintSessionsMap = {};
    
    /**
     * @private
     * create a lint session
     * 
     * @param {Document} doc
     * @return LintSession
     */
    function createLintSession(doc) {
        var file = doc.file.fullPath;
        var session = lintSessionsMap[file] = new LintSession(doc);
        session.managedEditors = [];
        
        $(session).on('lintingStart', session_lintStartHandler);
        $(session).on('errorMapChanged', session_errorMaChangedHandler);
        
        return lintSessionsMap[file];
    }
    
    /**
     * @private
     * destroy a LintSession
     * 
     * @param {string} file
     */
    function destroySession(file) {
        var session = lintSessionsMap[file];
        if (session) {
            $(session).off('lintingStart', session_lintStartHandler);
            $(session).off('errorMapChanged', session_errorMaChangedHandler);
            session.dispose();
            delete lintSessionsMap[file];
        }
    }
    
    /**
     * @private
     * Event Handler, handle the event notifying that the linting process has started for a session
     * 
     * @param {Event} event
     * @param {LintSession} session the session for which linting process has started
     */
    function session_lintStartHandler(event, session) {
        var file = utils.getSessionFile(session);
        utils.getEditorsForFile(editors, file).forEach(function (editor) {
            errorsMarks.removeAllMarks(editor);
        });
        errorToolTip.setErrorsMap(null, file);
        errorsTick.setErrorsMap(null, file);
    }
    
    /**
     * @private
     * Event Handler, handle the event notifying that the errorMaps of a session has changed
     * 
     * @param {Event} event
     * @param {LintSession} session the session for which errorMaps has changed
     */
    function session_errorMaChangedHandler(event, session) {
        var errorMaps = session.getErrorsMap();
        var file = utils.getSessionFile(session);
        utils.getEditorsForFile(editors, file).forEach(function (editor) {
            errorsMarks.markErrors(editor, errorMaps);
        });
        errorToolTip.setErrorsMap(errorMaps, file);
        errorsTick.setErrorsMap(errorMaps, file);
    }
    
    
    /**
     * @private
     * List of managed editor
     * 
     * @type {Object.<string, LintSession>}
     */
    var editors = [];
    
    /**
     * add an editor to the managed list of editor
     * 
     * @private
     * @param {Editor}
     */
    function addEditor(editor) {
        if (!editor) {
            return;
        }
        
        var file = utils.getEditorFile(editor);
        var session = lintSessionsMap[file] || createLintSession(editor.document);
        if (editors.indexOf(editor) === -1) {
            editors.push(editor);
            $(editor).on('beforeDestroy', editor_beforeDestroyHandler);
        }
        
        session.forceRun();
    }
    
    
    /**
     * @private
     * Event Handler, handle the event notifying 
     * 
     * @param {Event} event
     * @param {Editor} editor the editor that will be destroyed
     */
    function editor_beforeDestroyHandler(event, editor) {
        var index = editors.indexOf(editor);
        if (index !== -1) {
            editors.splice(index, 1);
            $(editor).off('beforeDestroy', editor_beforeDestroyHandler);
            
            var file = utils.getEditorFile(editor);
            var hasEditorForFile = editors.some(function (editor) {
                return utils.getEditorFile(editor) === file;
            });
            if (!hasEditorForFile) {
                destroySession(file);
            }
        }
    }
    
   
    
    /**
     * initialize the epicLinter plugin
     */
    function init() {
        $(EditorManager).on('activeEditorChange', function (event, editor) {
            addEditor(editor);
        });

        utils.getFullEditors().forEach(addEditor);

        errorToolTip.init(editors);
        errorsTick.init();
    }

    exports.init = init;
    
});
