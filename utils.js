/*global define  */

define(function (require) {
    'use strict';
    
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
                event.clientY <= offset.top + $div.height() + precisionY * 2);
    }
    
    return {
        divContainsMouse: divContainsMouse
    };
});
