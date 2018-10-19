var NIL = {};
// Render a course.
NIL.course = function(course) {
    var diagram = new NIL.Diagram(course);

    // SVG visualization
    var world = d3.select('body').append('div').attr('id', 'world')
                    .append("svg:svg")
                        .attr('viewBox','0 0 1200 600')
                        .append("svg:g")
    ;
    // Textual description
    var description = new NIL.Description(world);

    // Navigation components
    var navigation = new NIL.Navigation({
        diagram : diagram,
        selector : '#prev-next',
        tocSelector : '#table-of-contents',
        stepToggleSelector : '#steps-count'
    })

    diagram.on('change', function(graph) {
        description.update(graph.meta('title'), graph.meta('content'));

        NIL.Display.nodes(world, graph.nodes());
        NIL.Display.nodeOverlays(world, graph);
        NIL.Display.connectionLinks(world, graph.connections(), 'connect');
        NIL.Display.livePaths(world, graph, 'focusPath');

        navigation.update(graph.meta('index'), graph.meta('total'));
    })

    // Discern and load the step from the URL.
    var step = parseInt(window.location.hash.substring(1));
    step = (step > 0) ? (step - 1) : 0;
    diagram.get(step);
}
;
NIL.Description = function(container) {
    this.update = update;

    var d3Container = container
                        .append('g')
                            .attr('class', 'description')
                            .attr("text-anchor", 'middle')
                            .attr('transform', 'translate(600,50)')
    ;

    function update(heading, content) {
        d3Container
            .style('opacity', 0)
            .selectAll('text').remove()
        ;

        // var width = d3Container
        //                 .append('svg:text')
        //                     .text(heading)
        //                     .attr('y', 0)
        //                     .node().clientWidth
        // ;
        var width = 600;
        // line-break if needed
        if(width > 550) {
            var words = heading.split(' '),
                half = Math.ceil(words.length/2),
                firstLine = words.slice(0, half).join(' '),
                secondLine = words.slice(half, words.length).join(' ')
            ;

            d3Container
                .selectAll('text').remove()
            ;
            d3Container
                .append('svg:text')
                    .text(firstLine)
            ;
            d3Container
                .append('svg:text')
                    .attr('y', 40)
                    .text(secondLine)
            ;
        }
        else if(content && content.length > 0) {
            d3Container
                .append("foreignObject")
                    .attr('transform', 'translate(-400,20)')
                    .attr("width", 400)
                    .attr("height", 100)
                    .append("xhtml:body")
                        .append('xhtml:div')
                        .attr('class', 'sub-description')
                            .html(content)
            ;
        }

        d3Container
            .transition()
                //.delay(100)
                .duration(400)
                .style('opacity', 1);
    }
}
;
// A <Diagram> is the highest level model representation of a data visualization.
// A Diagram has many <States>s where a state represents a specific, navigatigable state of a Diagram.
// A State models instructions for building the Diagram at a particular state.
// States produce <Graph>s.
// A Graph models the actual graphical elements and coordinates used by d3 to create the visualization.
// 
// Usage:
// 
// A Diagram consumes 'state instructions' which are loaded from a remote data-source.
// We can ask the diagram to return a graph based on a given courseStep index.
// Each courseStep references a diagram state.
// The diagram is lazily evaluated so you must listen for the 'change' event:
//
//    var diagram = new NIL.Diagram({ diagramUrl : '/diagram.json', contentUrl : '/content.json' });
//    diagram.on('change', function(graph) {
        // Render the graph here.
//    })
//
//    // Pragmatically get a courseStep:
//    diagram.get(0);
NIL.Diagram = function(config) {
    if(!config) throw("Diagram endpoints are required");
    if(!config.iconsUrl) throw("'iconsUrl' endpoint is required");
    this.config = config;

    var dispatch = d3.dispatch('loaded', 'change');

    // Add event listeners.
    this.on = function(type, listener) {
        dispatch.on(type, listener);
    }

    // Get graph at courseStep <index>.
    this.get = function(index) {
        resolve(function() {
            getGraph(index);
        })
    }

    // Get graph at courseStep <index> where <index> is coerced to remain within courseStep bounds.
    this.getBounded = function(index) {
        resolve(function() {
            index = boundedIndex(index);
            getGraph(index);
        })
    }

    // Get all courseSteps.
    // The callback receives:
    //  [Array] - courseSteps. An ordered list of courseSteps.
    this.courseSteps = function(callback) {
        resolve(function() {
            callback(CourseSteps)
        })
    }

    // PRIVATE
    // Private functions assume the data has loaded.

    var AllowedMethods = ['add', 'update', 'remove'],
        States,
        CourseSteps,
        StateIds = {}
    ;

    // Resolve the state (data) of the diagram.
    // Data comes from a remote source so every public function should
    // execute its logic as a callback to resolve();
    function resolve(callback) {
        if(CourseSteps) {
            callback();
        }
        else {
            d3.json(contentUrl(), function(courseData) {
                if(courseData) {
                    d3.json(diagramUrl(), function(diagramData) {
                        if(diagramData) {
                            States = diagramData.states;
                            processStateIds(diagramData.states);
                            CourseSteps = courseData.steps;
                            CourseSteps.forEach(function(step, i) {
                                step.index = i;
                                step.diagramStateIndex = StateIds[step.diagramState];
                            })

                            dispatch.loaded();
                            callback();
                        }
                        else {
                            throw("Could not retrieve data from: " + diagramUrl() );
                        }
                    })

                }
                else {
                    throw("Could not retrieve data from: " + contentUrl() );
                }
            })

        }
    }

    function processStateIds(states) {
        states.forEach(function(state, i) {
            if(state.diagramState) {
                StateIds[state.diagramState] = i;
            }
        })
    }

    // This is asking me for a courseStep index.
    // diagrams are index dependent based on building the graph.
    // Example: CourseSteps[0] -> States[2]
    // The graph is not directly returned, rather it is emitted on the 'change' event.
    // ex: diagram.on('change', function(graph) {});
    function getGraph(index) {
        var stateIndex = CourseSteps[index].diagramStateIndex,
            states = States.slice(0, stateIndex+1);
        var positions = states.reduce(function(accumulator, state) {
                            if(state.positions) {
                                for(key in state.positions) {
                                    accumulator[key] = state.positions[key];
                                }
                            }
                            return accumulator;
                          }, {});
        var connections = states.reduce(function(accumulator, state) {
                            if(state.connections) {
                                for(key in state.connections) {
                                    accumulator[key] = state.connections[key];
                                }
                            }
                            return accumulator;
                          }, {});

        var items = JSON.parse(JSON.stringify(states.shift().actions[0].items)),
            graph = new NIL.Graph(processItems(items)),
            metadata = {};

        // Note this process mutates the graph object in place.
        states.reduce(function(accumulator, state) {
            return merge(accumulator, state);
        }, graph);

        graph.position(positions);
        graph.connections(connections);

        graph.setMeta(CourseSteps[index]);
        graph.setMeta({ "total" : CourseSteps.length });

        dispatch.change(graph);
    }

    // stay in bounds
    function boundedIndex(index) {
        if (index < 0) {
            index = CourseSteps.length-1;
        }
        else if (index > CourseSteps.length-1) {
            index = 0;
        }

        return index;
    }

    function merge(graph, state) {
        var actions = state.actions || [];
        if(actions.length === 0) {
            throw "The diagramState '"+ state.diagramState + "' has 0 action statements."
        }

        actions.forEach(function(action) {
            verifyMethod(action.method);

            switch (action.method) {
                case "add":
                    graph.add(processItems(action.items));
                    break;
                case "update":
                    graph.update(action.items);
                    break;
                case "remove":
                    var names = action.items.map(function(item){ return item.id });
                    graph.drop(names);
                    break;
            }
        })

        return graph;
    }

    function processItems(items) {
        items.forEach(function(d) {
            d.iconsUrl = config.iconsUrl;
        })
        return items;
    }

    function verifyMethod(method) {
        if(AllowedMethods.indexOf(method) === -1) {
            throw("The method: '" + method + "' is not recognized."
                    + "\n Supported methods are: " + AllowedMethods.toString());
        }
    }

    function contentUrl() {
        return config.contentUrl + '?' + Math.random();
    }

    function diagramUrl() {
        return config.diagramUrl + '?' + Math.random();
    }
}
;
// Display a <Graph> using d3.
NIL.Display = (function() {
    var config = { duration : 500 };

    function nodes(svgContainer, _nodes) {
        // Update the nodes
        var node = svgContainer.selectAll("g.node")
            .data(_nodes, function(d) { return d._id });

        var nodeEnter = node.enter().append("svg:g")
            .attr('class', function(d){ return 'node ' + d.icon })
            .attr("transform", function(d) {
                return "translate(" + (d.x0 || 0) + "," + (d.y0 || 0) + ")";
            })

        nodeEnter.call(NIL.Style.icon);

        nodeEnter
            .filter(function(d) { return !!d.text })
            .call(NIL.Style.text)

        nodeEnter.call(NIL.Style.labels);

        // Transition nodes to their new position.
        var nodeUpdate = node.transition()
            .duration(config.duration)
            .attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")";
            });

        nodeUpdate.select("text")
            .style("fill-opacity", 1);


        node.exit().remove();

        return node;
    }

    function nodeOverlays(svgContainer, graph) {
        var types = ['focus', 'crossOut', "disable"];
        var nodes = svgContainer.selectAll("g.node");

        types.forEach(function(type) {
            nodes
                .data(graph.metaItems(type), function(d) { return d._id })
                .call(NIL.Style[type]);
        })
    }

    // Update link connections between items.
    // @param[Array] linkData - formated linkData for d3.
    // @param[String] namespace - used to preserve grouping and uniqueness.
    function connectionLinks(svgContainer, linkData, namespace) {
        var diagonal = d3.svg.diagonal().projection(function(d) { return [d.x, d.y]; });
        var classname = 'link-' + namespace;
        // Update the links.
        var link = svgContainer.selectAll("path." + classname)
            .data(linkData, function(d) { return d.source._id + '.' + d.target._id; });

        // Enter any new links at the parent's previous position.
        var linkEnter = link.enter().insert("svg:path", "g")
            .style('stroke-opacity', 0)
            .attr("class", function(d) {
                return (d.source.public && d.target.public)
                            ? classname + ' public'
                            : classname;
            })
            .attr("d", diagonal);

        link.transition()
            .duration(config.duration)
                .style('stroke-opacity', 1)
                .attr("d", diagonal);


        link.exit().remove();

        return link;
    }

    // Similar to connectionLinks but adds animated directional flow icons.
    // @param[Array] linkData - formated linkData for d3.
    // @param[String] namespace - used to preserve grouping and uniqueness.
    // @param[Boolean] reverse - set true to reverse animation direction.
    function livePaths(svgContainer, graph, namespace, reverse) {
        var linkData = diagonalFocusPathLinks(graph);
        var pathData = connectionLinks(svgContainer, linkData, namespace)
            .call(NIL.Style.pulsePath)

        updateFlowIcons(svgContainer, linkData, pathData[0], namespace, reverse);

        return pathData;
    }

    // @param[Array] linkData - formated linkData for d3.
    // @param[Array] paths - actual SVG path DOM nodes required.
    // @param[String] namespace - used to preserve grouping and uniqueness.
    function updateFlowIcons(svgContainer, linkData, paths, namespace, reverse) {
        var markerData = [];
        paths.map(function(d, i) {
            if(d) {
                var slope = (linkData[i].target.y - linkData[i].source.y)/
                                (linkData[i].target.x - linkData[i].source.x);
                // this coincides with the transform(rotate()) format (clockwise degrees)
                var degree = Math.atan(slope) * (180/Math.PI);
                markerData.push({
                    path: d,
                    degree : degree,
                    reverse : reverse,
                    iconsUrl : linkData[i].source.iconsUrl,
                    _id : (linkData[i].source._id + linkData[i].target._id + namespace)
                });
            }
        });

        var markers = svgContainer.selectAll("g." + namespace)
                        .data(markerData, function(d) { return d._id });

        var markersEnter = markers.enter().append("svg:g")
            .attr('class', namespace + ' flow-icon')
            .call(NIL.Style.flowIcon)
        ;

        markers.transition()
            .delay(400)
            .duration(1500)
            .attrTween("transform", function(d) {
                var l = d.path.getTotalLength()/2; // mid-point
                  return function(t) {
                    var offset = t * l;
                    if (d.reverse) {
                        offset = d.path.getTotalLength() - offset;
                    }
                    var p = d.path.getPointAtLength(offset);
                    return "translate(" + p.x + "," + p.y + ")";
                  };
            })

        markers.exit().transition()
            .duration(config.duration)
            .style("fill-opacity", 0)
            .remove();

        return markers;
    }


    // @return[Array] link data for building lines with d3.svg.diagonal().
    function diagonalFocusPathLinks(graph) {
        var links = [],
            paths = [];

        if (graph.metaItems('focusPath').length > 0) {
            var paths = [graph.metaItems('focusPath')];
        } else if (graph.meta('focusPaths')) {
            var paths = graph.meta('focusPaths').map(function(path) {
                return graph.findAll(path);
            })
        }

        paths.forEach(function(path) {
            links = links.concat(diagonalPathLinks(path));
        })

        return links;
    }

    // @param[Array] path - ordered item objects denoting desired path.
    // @return[Array] link objects for the path for use with d3.svg.diagonal().
    function diagonalPathLinks(path) {
        var links = [];
        path.forEach(function(d, i) {
            if(path[i+1]) {
                links.push({
                    source: d,
                    target: path[i+1]
                });
            }
        })

        return links;
    }

    return ({
        nodes : nodes,
        nodeOverlays : nodeOverlays,
        connectionLinks : connectionLinks,
        livePaths : livePaths
    })
})();
// The Graph object models our data format as a graph of nodes/items and connections.
NIL.Graph = function(items) {
    this.get = get;
    this.getAll = getAll;
    this.find = find;
    this.findAll = findAll;
    this.set = set;
    this.add = add;
    this.update = update;
    this.drop = drop;

    this.meta = meta;
    this.setMeta = setMeta;
    this.metaItems = metaItems;

    this.nodes = nodes;
    this.position = position;
    this.connections = connections;

    var __dict__ = dictify(items),
        __meta__ = {},
        __connectionLinks__ = []
    ;

    function meta(key) {
        return __meta__[key];
    }

    function setMeta(attributes) {
        for (key in attributes) {
            __meta__[key] = attributes[key];
        }
    }

    // Get items mappped from a meta attribute holding item ids.
    function metaItems(key) {
        return findAll(meta(key));
    }

    // Get an item.
    function get(key) {
        return __dict__[key];
    };

    // Set an item.
    function set(key, value) {
        __dict__[key] = value;
    };

    // Get an item or throw error if not found.
    function find(key) {
        if(get(key)) {
            return get(key);
        }
        else {
            throw "Could not find item using id: " + key;
        }
    }

    function getAll(keys) {
        var items = [];
        coerceArray(keys).forEach(function(name) {
            if(get(name)) {
                items.push(get(name));
            }
        })

        return items;
    };

    function findAll(keys) {
        return coerceArray(keys).map(function(name) {
            return find(name);
        })
    };

    // Delete an item.
    function _delete(key) {
        delete __dict__[key];
    }

    // Add an item to the graph in relation (mapped) to another item.
    function add(items) {
        addToDict(items);
    }

    // Update item attributes.
    function update(items) {
        coerceArray(items).forEach(function(item) {
            for(key in item) {
                __dict__[item.id][key] = item[key];
            }
        })
    }

    // Drop one or more items from the graph.
    function drop(names) {
        if(!Array.isArray(names)) {
            names = [names];
        }
        names.forEach(function(name) {
            _delete(name);
        })
    }

    // Set x and y coordinates for each item.
    // Note this is mutable service, it mutates the graph.
    function position(data) {
        for(id in __dict__) {
            __dict__[id]._id = __dict__[id].id || __dict__[id].name;
            var coord = {
                x : data[id][0],
                y : data[id][1] + 130
            }

            __dict__[id].x0 = 600;
            __dict__[id].y0 = 500;
            __dict__[id].x = coord.x;
            __dict__[id].y = coord.y;
        }

        for(id in __dict__) {
            if(__dict__[id].from && get(__dict__[id].from)) {
                var from = get(__dict__[id].from);
                __dict__[id].x0 = from.x;
                __dict__[id].y0 = from.y;
            }
        }
    }

    function nodes() {
        return d3.values(__dict__);
    }

    // @return[Array] link objects for all connections in a graph.
    // For use with d3.svg.diagonal().
    function connections(data) {
        if(data) {
            __connectionLinks__ = [];

            for(key in data) {
                if(get(key)) {
                    getAll(data[key]).forEach(function(item) {
                        __connectionLinks__.push({
                            source: get(key),
                            target: item
                        });
                    })
                }
            }
        }

        return __connectionLinks__;
    }

    // Private

    // Generate a dictionary graph from an ordered Array represenation.
    function dictify(items) {
        var dict = {};
        items.forEach(function(item, i) {
            dict[item.id] = item;
        })

        return dict;
    }

    function addToDict(items) {
        var dict = dictify(items);
        for (key in dict) {
            set(key, dict[key]);
        };
    }

    function coerceArray(input) {
        var result = [];
        if(Array.isArray(input)) {
            result = input;
        }
        else if(input) {
            result.push(input);
        }
        return result;
    }
};
NIL.Navigation = function(config) {
    this.next = next;
    this.previous = previous;
    this.navigate = navigate;
    this.update = update;

    var current = 0,
        tableOfContents = new NIL.TableOfContents(config.tocSelector, config.stepToggleSelector)
    ;

    config.diagram.on('loaded', function() {
        config.diagram.courseSteps(function(steps) {
            draw();

            tableOfContents.updateList(steps)
                .on('click', function(d, i) {
                    d3.event.preventDefault();
                    navigate(i);
                    tableOfContents.hide();
                })

            d3.select("body")
                .on("keydown", function(){
                    if(d3.event.keyCode === 39) // right arrow
                        next();
                    else if(d3.event.keyCode === 37) // left arrow
                        previous();
                })
        })
    })

    function update(index, total) {
        current = index;
        tableOfContents.updateStep(index, total);
        tableOfContents.highlight(current);
        window.location.replace("#" + (current +1));
    }

    function next () {
        navigate(current+1);
    }

    function previous() {
        navigate(current-1);
    }

    // Prgramatically navigate to step at index.
    function navigate(index) {
        config.diagram.getBounded(index);
    }

    // draw the DOM nodes into the DOM.
    function draw() {
        var container = document.createElement("div");
        container.id = config.selector.slice(1);

        var d3C = d3.select(container);
        d3C.append('svg')
            .attr('class', 'previous')
            .on('click', previous)
            .attr('x', 0)
            .attr('y', 0)
            .attr('viewBox', '0 0 20 20')
            .attr('enable-background', 'new 0 0 20 20')
            .append('path')
                .attr('transform', 'translate(20,0), scale(-1,1)')
                .attr('d', 'M2.679,18.436c0,0.86,0.609,1.212,1.354,0.782l14.612-8.437c0.745-0.43,0.745-1.134,0-1.563L4.033,0.782   c-0.745-0.43-1.354-0.078-1.354,0.782V18.436z');

        d3C.append('svg')
            .attr('class', 'next')
            .on('click', next)
            .attr('x', 0)
            .attr('y', 0)
            .attr('viewBox', '0 0 20 20')
            .attr('enable-background', 'new 0 0 20 20')
            .append('path')
                .attr('d', 'M2.679,18.436c0,0.86,0.609,1.212,1.354,0.782l14.612-8.437c0.745-0.43,0.745-1.134,0-1.563L4.033,0.782   c-0.745-0.43-1.354-0.078-1.354,0.782V18.436z');

        var wrap = document.createElement("div");
        wrap.id = 'prev-next-wrap';
        wrap.appendChild(container);

        document.body.appendChild(wrap);
    }
}
;
NIL.Style = {
    duration : 500
    ,
    text : function(nodes) {
        nodes.append("svg:text")
                .attr('class', 'text-bg')
                .attr("dy", 65)
                .attr("text-anchor", function(d) { return d['text-anchor'] || 'middle' })
                .text(function(d) { return d.text });

        nodes.append("svg:text")
            .attr("dy", 65)
            .attr("text-anchor", function(d) { return d['text-anchor'] || 'middle' })
            .text(function(d) { return d.text });

        return nodes;
    }

    ,
    clicker : function(nodes) {
        nodes.append('circle')
            .attr('class', 'clicker')
            .attr('r', 50);
        return nodes;
    }
    ,
    icon : function(nodes) {
        nodes.append('circle')
            .attr('class', 'icon-bg')
            .attr('r', 14)

        nodes.append('g').append('use')
            .attr('xlink:href', function(d) { return (d.iconsUrl + '#' + d.icon) })
            .attr('class', function(d) { return "icon " + d.icon })
            .attr('height', function(d) {
                return d.depth > 0 ? 20 : 30;
            })
            .attr('width', function(d) {
                return d.depth > 0 ? 20 : 30;
            })

        nodes.call(NIL.Style.clicker);

        return nodes;
    }
    ,
    labels : function(nodes) {
        nodes.append("svg:text")
                .attr('class', 'text-bg')
                .attr("dy", 35)
                .attr("text-anchor", "middle")
                .text(function(d) { return d.name || d.id })

        nodes.append("svg:text")
                .attr("dy", 35)
                .attr("text-anchor", "middle")
                .text(function(d) { return d.name || d.id });

        return nodes;
    }

    ,
    focus : function(nodes) {
        nodes.selectAll("use")
            .transition()
            .duration(NIL.Style.duration)
                .attr('x', -30)
                .attr('y', -30)
                .attr('height', 60)
                .attr('width', 60)
            .transition()
            .duration(NIL.Style.duration)
                .attr('x', -25)
                .attr('y', -25)
                .attr('height', 50)
                .attr('width', 50)

        nodes.exit().selectAll("use").transition()
            .duration(NIL.Style.duration)
                .attr('x', -15)
                .attr('y', -15)
                .attr('height', 30)
                .attr('width', 30)

        nodes.selectAll("circle.software")
            .transition()
                .duration(NIL.Style.duration)
                .attr('r', 20)
            .transition()
                .duration(NIL.Style.duration)
                .attr('r', 16)


        nodes.exit().selectAll("circle.software").transition()
            .duration(NIL.Style.duration)
            .attr('r', 8)

        nodes.insert('svg:circle', 'g')
            .attr('class', 'focus')
            .attr('r', 0)
            .transition()
                .duration(NIL.Style.duration)
                .attr('r', 60)
            .transition()
                .duration(NIL.Style.duration)
                .attr('r', 50)


        nodes.exit().selectAll("circle.focus").transition()
            .duration(NIL.Style.duration)
            .attr('r', 0)
            .remove()

        return nodes;
    }

    ,
    crossOut : function(nodes) {
        var size = 30;
        var nodesEnter = nodes.append('use')
            .attr('xlink:href', function(d) { return (d.iconsUrl + '#cross-out') })
            .attr('class', 'cross-out')
            .attr('x', -(size/2))
            .attr('y', -(size/2))
            .attr('height', size)
            .attr('width', size)

        nodes.exit()
            .selectAll("use.cross-out").remove();

        return nodes;
    }

    ,
    disable : function(nodes) {
        nodes.style('opacity', 0.7)

        nodes.exit()
            .style('opacity', 1);

        return nodes;
    }

    ,
    pulsePath : function(nodes) {
        nodes
            .transition()
                .duration(NIL.Style.duration)
                .style('stroke-opacity', 1)
                .style('stroke-width', 4)
            .transition()
                .duration(NIL.Style.duration)
                .style('stroke-width', 2)

        return nodes;
    }

    ,
    flowIcon : function(nodes) {
        nodes.append('use')
            .attr('xlink:href', function(d) { return (d.iconsUrl + '#flow-icon') })
            .attr('height', 20)
            .attr('width', 20)
            .attr('x', -10)
            .attr('y', -10)
            .attr('transform', function(d) {
                return 'rotate(' + (d.degree + (d.reverse ? 180 : 0)) + ')';
            });

        return nodes;
    }
}
;
NIL.TableOfContents = function(containerSelector, stepToggleSelector) {
    this.show = show;
    this.hide = hide;
    this.highlight = highlight;
    this.updateStep = updateStep;
    this.updateList = updateList;

    var d3StepToggle = d3.select('body').append('div')
                            .attr('id', stepToggleSelector.slice(1))
                            .on('click', toggle);

    var container = document.createElement('div');
    container.id = containerSelector.slice(1);

    var d3Toc = d3.select(container);
    d3Toc.append('h4').text('Table of Contents');
    d3Toc.append('ol');

    document.body.appendChild(d3Toc.node());

    function updateStep(index, total) {
        var current = index + 1;
        var menu = '<svg viewBox="0 0 90 90" enable-background="new 0 0 90 90" xml:space="preserve">'
                    + '<path d="M29,34h32c1.1,0,2-0.9,2-2c0-1.1-0.9-2-2-2H29c-1.1,0-2,0.9-2,2C27,33.1,27.9,34,29,34z"/>'
                    + '<path d="M61,43H29c-1.1,0-2,0.9-2,2c0,1.1,0.9,2,2,2h32c1.1,0,2-0.9,2-2C63,43.9,62.1,43,61,43z"/>'
                    + '<path d="M61,56H29c-1.1,0-2,0.9-2,2c0,1.1,0.9,2,2,2h32c1.1,0,2-0.9,2-2C63,56.9,62.1,56,61,56z"/>'
                    + '</svg>'
                    ;

        var count = '<em>'+ current + '</em> of ' + total + menu;
        d3StepToggle.html(count);

        d3.select('#signup-form').classed('active', current === total);
    }

    // update the table of contents list.
    function updateList(steps, index) {
        var self = this;
        current = index || 0;

        steps.forEach(function(d, i) {
            d.active = (i === index);
        })

        var nodes = d3Toc.select('ol').selectAll('li')
                    .data(steps)
                    .classed('active', function(d) { return d.active })

        nodes.exit().remove();

        return nodes.enter()
            .append('li')
                .classed('active', function(d) { return d.active })
            .append('a')
                .html(function(d) { return d.title })
    }

    function toggle() {
        d3Toc.classed('active', !d3Toc.classed('active'));
    }

    function show() {
        d3Toc.classed('active', true);
    }

    function hide() {
        d3Toc.classed('active', false);
    }

    function highlight(index) {
        d3Toc.select('ol').selectAll('li')
            .classed('active', false)
            .filter(':nth-child('+ (index+1) +')').classed('active', true);
    }
}
;
// This is a manifest file that'll be compiled into application.js, which will include all the files
// listed below.
//
// Any JavaScript/Coffee file within this directory, lib/assets/javascripts, vendor/assets/javascripts,
// or vendor/assets/javascripts of plugins, if any, can be referenced here using a relative path.
//
// It's not advisable to add code directly here, but if you do, it'll appear at the bottom of the
// the compiled file.
//
// WARNING: THE FIRST BLANK LINE MARKS THE END OF WHAT'S TO BE PROCESSED, ANY BLANK LINE SHOULD
// GO AFTER THE REQUIRES BELOW.
//

;
