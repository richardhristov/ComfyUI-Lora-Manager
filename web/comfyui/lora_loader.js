import { app } from "../../scripts/app.js";
import { addLorasWidget } from "./loras_widget.js";

function mergeLoras(lorasText, lorasJson) {
    const result = [];
    const pattern = /<lora:([^:]+):([\d\.]+)>/g;
    let match;

    // Parse text input and create initial entries
    while ((match = pattern.exec(lorasText)) !== null) {
        const name = match[1];
        const inputStrength = Number(match[2]);
        
        // Find if this lora exists in the JSON data
        const existingLora = lorasJson.find(l => l.name === name);
        
        result.push({
            name: name,
            // Use existing strength if available, otherwise use input strength
            strength: existingLora ? existingLora.strength : inputStrength,
            active: existingLora ? existingLora.active : true
        });
    }

    return result;
}

app.registerExtension({
    name: "LoraManager.LoraLoader",
    
    async nodeCreated(node) {
        if (node.comfyClass === "Lora Loader (LoraManager)") {
            // Enable widget serialization
            node.serialize_widgets = true;

            // Wait for node to be properly initialized
            requestAnimationFrame(() => {               
                // Restore saved value if exists
                let existingLoras = [];
                if (node.widgets_values && node.widgets_values.length > 0) {
                    const savedValue = node.widgets_values[1];
                    // TODO: clean up this code
                    try {
                        // Check if the value is already an array/object
                        if (typeof savedValue === 'object' && savedValue !== null) {
                            existingLoras = savedValue;
                        } else if (typeof savedValue === 'string') {
                            existingLoras = JSON.parse(savedValue);
                        }
                    } catch (e) {
                        console.warn("Failed to parse loras data:", e);
                        existingLoras = [];
                    }
                }
                // Merge the loras data
                const mergedLoras = mergeLoras(node.widgets[0].value, existingLoras);
                
                // Add flag to prevent callback loops
                let isUpdating = false;
                 
                // Get the widget object directly from the returned object
                const result = addLorasWidget(node, "loras", {
                    defaultVal: mergedLoras  // Pass object directly
                }, (value) => {
                    // Prevent recursive calls
                    if (isUpdating) return;
                    isUpdating = true;
                    
                    try {
                        // Remove loras that are not in the value array
                        const inputWidget = node.widgets[0];
                        const pattern = /<lora:([^:]+):([\d\.]+)>/g;
                        const currentLoras = value.map(l => l.name);
                        
                        let newText = inputWidget.value.replace(pattern, (match, name, strength) => {
                            return currentLoras.includes(name) ? match : '';
                        });
                        
                        // Clean up multiple spaces and trim
                        newText = newText.replace(/\s+/g, ' ').trim();
                        
                        inputWidget.value = newText;
                    } finally {
                        isUpdating = false;
                    }
                });
                
                node.lorasWidget = result.widget;

                // get the input widget and set a callback
                const inputWidget = node.widgets[0];
                inputWidget.callback = (value) => {
                    // Prevent recursive calls
                    if (isUpdating) return;
                    isUpdating = true;
                    
                    try {
                        // Merge the loras data with widget value
                        const currentLoras = node.lorasWidget.value || [];
                        const mergedLoras = mergeLoras(value, currentLoras);
                        
                        node.lorasWidget.value = mergedLoras;
                    } finally {
                        isUpdating = false;
                    }
                };
            });
        }
    },
});