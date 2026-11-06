class IMap {
    constructor(yardMap, ctx, width, height) {
        // Yard mapping coordinates json
        this.yardMap = yardMap;
        // Products json
        this.Products = Products;
        // Canvas object
        this.ctx = ctx;
        this.defaultFont = "12px Arial";
        this.defaultStrokeColor = "black";
        this.rotate = "";
        // Hash of distinct locations and badge counts for that location
        this.LocsBadges = new Map();
        this.width = width;
        this.height = height;
        this.badgeColor = "#0C5B2E";
    }

    static getUniqueVals(a) {
        return [...new Set(a)];
    }

    writeValue(val, indents) {
        let spaces = "";
        for(let i = 0; i<indents; i++) {
            //spaces += "&emsp;";
            spaces += "   ";
        }
        //document.getElementById("mainDiv").innerHTML += spaces + val + "<br>";
        console.log(spaces + val);
    }

    clearArea(width, height) {
        this.ctx.clearRect(0, 0, width, height);
    }

    drawYard(clearFirst) {
        if(clearFirst) this.ctx.clearRect(0, 0, this.width, this.height);
        for(const loc in this.yardMap) {
            if(this.yardMap.hasOwnProperty(loc)) {
                let title = "";
                // Don't label Poles, Toy Shed, or Yard outlines with location info in parens
                if (typeof this.yardMap[loc].title === 'undefined') title = "";
                else if (!(isNaN(loc))) { title = this.yardMap[loc].title + " (" + loc + ")"; }
                else title = this.yardMap[loc].title;

                this.rotate = this.yardMap[loc].outlineRotate;
                this.drawOutline(this.yardMap[loc].outline, "", this.yardMap[loc].outlineStrokeStyle);
                this.rotate = this.yardMap[loc].titleRotate;
                this.addLabel(this.yardMap[loc].outline, title);
            }
        }
    }

    getDistinctLocsBadges(prodHash) {
        // A location can hold packs of several products; add them all up for the badge count.
        // Format 2 (BTPi productMap): locations = { "03A09": 2, ... } (packs per location).
        // Format 1 (getProducts.py):  locations = ["03A09", "03A09", ...] (one entry per pack).
        for (const prod in prodHash) {
            if(prodHash.hasOwnProperty(prod)) {
                const locs = prodHash[prod].locations;
                if (Array.isArray(locs)) {
                    for (const loc of locs) this.addPacks(loc, 1);
                } else if (locs && typeof locs === "object") {
                    for (const loc in locs) {
                        if (locs.hasOwnProperty(loc)) this.addPacks(loc, Number(locs[loc]) || 0);
                    }
                }
            }
        }
    }

    addPacks(location, packs) {
        if (packs <= 0) return;
        this.LocsBadges.set(location, (this.LocsBadges.get(location) || 0) + packs);
    }

    isNumeric(str) {
        if (typeof str != "string") return false; // we only process strings!
        return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
               !isNaN(parseFloat(str)); // ...and ensure strings of whitespace fail
    }

    drawProdLocWithBadge(location, badgeCount) {
        if(typeof location !== 'undefined') {
            if (location.slice(0, 2) != "MM") {
                if(location.length == 5){
                    // Split the location string (e.g. "30B02") into it's three components
                    const reg = /([A-Z0-9]{2})([A-Z]{1})([A-Z0-9]{2})/.exec(location);
                    let area = reg[1];
                    let side = reg[2];
                    let bay = reg[3];

                    //console.log(`Area ${area}, side ${side}, bay ${bay}: Count ${badgeCount}`);
                    if((typeof area === 'undefined') || (typeof side === 'undefined') || (typeof bay === 'undefined') || (!(this.isNumeric(bay)))) {
                        console.log(`Location ${location} has an undefined or invalid area '${area}', side '${side}', or bay '${bay}': Count ${badgeCount}`);
                    } else if(!(this.yardMap.hasOwnProperty(area))) {
                        console.log(`Mising area '${area}' for location '${location}'`);
                    } else if (!(this.yardMap[area].sides.hasOwnProperty(side))) {
                        console.log(`Mising side '${side}' for location '${location}', area '${area}'`);
                    } else if (!(this.yardMap[area].sides[side].bays.hasOwnProperty(bay))) {
                        console.log(`Mising bay '${bay}' for location '${location}', area '${area}', side '${side}'`);
                    } else {
                        this.drawOutline(this.yardMap[area].sides[side].bays[bay].outline);
                        this.drawBadge(this.yardMap[area].sides[side].bays[bay].badge, badgeCount, this.badgeColor, "white");
                    }
                } else {
                    console.log("Location '" + location + "' has an unexpected length for parsing");
                }
            } else {
                console.log(`Skipping MM location '${location}'`);
            }

        } else {
            console.log("Location is undefined");
        }
    }

    drawBadge(coordsArray, title, fillColor, txtColor) {
        this.ctx.beginPath();
        this.ctx.arc(coordsArray[0], coordsArray[1], coordsArray[2], 0, 2 * Math.PI);
        if ((typeof fillColor !== 'undefined') && (fillColor != "")) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        } else {
            this.ctx.stroke();
        }
        if ((typeof txtColor === 'undefined') || (txtColor == "")) {
            txtColor = "black";
        }
        this.ctx.fillStyle = txtColor;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.font = "12px Verdana";
        this.ctx.fillText(title, coordsArray[0], coordsArray[1]+1);
    }

    fillOrStroke(svgPath, stroke, fillColor, strokeStyle) {
        let oldStrokeStyle = this.ctx.strokeStyle;
        if ((typeof strokeStyle !== 'undefined') && (strokeStyle != "")) {
            //e.g. rgba(255, 0, 0, 0.5)
            this.ctx.strokeStyle = strokeStyle;
        } else {
            this.ctx.strokeStyle = this.defaultStrokeColor;
        }
        // If a SVG path object is passed, use it
        if ((typeof svgPath !== 'undefined') && (svgPath != "")) {
            // If a color string is passed, fill with that color
            if ((typeof fillColor !== 'undefined') && (fillColor != "")) {
                this.ctx.fillStyle = fillColor;
                this.ctx.strokeStyle = fillColor;
                this.ctx.fill(svgPath);
            }
            if (stroke) this.ctx.stroke(svgPath);
        } else {
            if ((typeof fillColor !== 'undefined') && (fillColor != "")) {
                this.ctx.fillStyle = fillColor;
                this.ctx.strokeStyle = fillColor;
                this.ctx.fill();
            }
            if (stroke) this.ctx.stroke();
        }
        // Reset stroke style to original format
        this.ctx.strokeStyle = oldStrokeStyle;
    }

    drawText(text, x, y, fillColor) {
        //console.log(`Drawing text '${text}' at ${x},${y} with font ${this.ctx.font}`);
        this.ctx.font = this.defaultFont;
        this.ctx.fillStyle = fillColor;
        this.ctx.textAlign = "left";
        this.ctx.fillText(text, x, y);
    }

    drawOutline(coordArray, fillColor, strokeStyle) {
        if ((typeof coordArray !== 'undefined') && (coordArray != "") && Array.isArray(coordArray)) {
            this.ctx.beginPath();
            if(coordArray[0] == "circle"){
                this.ctx.arc(coordArray[1], coordArray[2], coordArray[3], coordArray[4], 2 * Math.PI);
                this.fillOrStroke("", true, fillColor, strokeStyle);
            } else {
                if ((typeof this.rotate !== 'undefined') && (this.rotate != "") && Array.isArray(this.rotate) && (coordArray[0] == "rect")) {
                    let x = this.rotate[0];
                    let y = this.rotate[1];
                    let horiz = this.rotate[2];
                    let vert = this.rotate[3];
                    let angle = this.rotate[4];
                    console.log(`x: ${x}, y: ${y}, horiz: ${horiz}, vert: ${vert}, angle: ${angle} coordArray0: ${coordArray[0]}`);
                    // Save the context so we can restore it later after rotation
                    this.ctx.save();
                    // Get the coordinates of the center of the rectangle and set the new origin
                    x += (horiz/2);
                    y += (vert/2);
                    this.ctx.translate(x, y);
                    // Calculate radians
                    let radians = (angle * Math.PI / 180);
                    // Rotate the entire context and draw centered text
                    this.ctx.rotate(radians);
                    // Context is rotated; build new SVG string using negative coordinates
                    x = -horiz/2;
                    y = -vert/2;
                    let coords = `M ${x} ${y} h ${horiz} v ${vert} h ${-horiz} z`;
                    console.log(coords);
                    let p = new Path2D(coords);
                    // TODO: Remove red fill and test?
                    this.ctx.fillStyle = "red";
                    this.ctx.fill(p);
                    this.ctx.restore();
                 } else {
                    let p = new Path2D(coordArray[1]);
                    this.fillOrStroke(p, true, fillColor, strokeStyle);
                 }
            }
        }
    }

    addLabel(coordArray, text) {
        if ((typeof this.rotate !== 'undefined') && (this.rotate != "") && Array.isArray(this.rotate)) {
            let x = this.rotate[0];
            let y = this.rotate[1];
            let angle = this.rotate[2];
            // Save the context so we can restore it later after rotation
            this.ctx.save();
            // Move to the spot where text should be drawn
            this.ctx.translate(x, y);
            // Calculate radians
            let radians = (angle * Math.PI / 180);
            // Rotate the entire context and draw centered text
            this.ctx.rotate(radians);
            this.ctx.font = this.defaultFont;
            this.ctx.fillStyle = "black";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "bottom";
            // Line height of 12 should match pixel height of font?
            this.ctx.fillText(text, 0, 12);
            // Restore context back to our save point
            this.ctx.restore();
        } else if ((typeof text !== 'undefined') && (text!= "")) {
            // Add label; Use the title as the text, find x,y vals from svg coords and add padding
            let x;
            let y;
            if (coordArray[0] == "circle") {
                x = coordArray[1] - 17;
                y = coordArray[2] - (coordArray[3] + 6);
            } else {
                let vArray = coordArray[1].split(" ");
                x = parseInt(vArray[1]) + 3;
                y = parseInt(vArray[2]) - 10;
            }
            //console.log(`${title}: ${x}, ${y}`);
            this.drawText(text, x, y, "black");
            //this.ctx.fillText(title, x+10, y+20);
        }
    }

} // End class
