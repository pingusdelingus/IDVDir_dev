
import * as antlr4 from 'antlr4';
window.antlr4 = antlr4;

import {default as Lexer} from './TPTPLexer';
import {default as Parser} from './TPTPParser';
import {default as Listener} from './TPTPListener';

const TerminalNode = antlr4.TerminalNode;
const ParserRuleContext = antlr4.ParserRuleContext;


function stripParens(formula){
	return formula.replace(/\s+/g,'').replace(/[()]/g, '');
}

function interpretationLabel(node){
    let s = node.formula.replace(/"/g, '\\"');
    let lastColonPos = s.lastIndexOf(":");
    let beforeColon = s.substr(0,lastColonPos).trim();
    if (beforeColon.startsWith("'") && beforeColon.endsWith("'")){
        return s.split("'")[1];
    }
    return (lastColonPos == -1) ? s : beforeColon;
}

function getNodeShape(node) {
	let shapeMap = {
		axiom: "invtriangle",
		conjecture: "house",
		negated_conjecture: "invhouse",
		plain: "ellipse"
	}
	if (stripParens(node.formula) == "$false") {
		return "box";
	}

    if (window.interpretation && stripParens(node.formula) == "$true"){
        return "box";
    }

	return shapeMap[node.role];
}

function getNodeColor(node) {
	let colorMap = {
		thf: "blue",
		tff: "orange",
		tcf: "grey30",
		fof: "green",
		cnf: "red"
	}
	return colorMap[node.type];
}

function scaleFromInterestingness(interestingness) {
	interestingness = +interestingness;
	let defaultSize = 1;
	if ([-1, undefined].includes(interestingness)) {
		return defaultSize;
	}
	else {
		return 0.5 * (1 + interestingness) + 0.5;
	}
}

window.scaleFromInterestingness = scaleFromInterestingness;

// helper function for extracting recursive parent information:
function getParentsFromSource(source, node){
  // return faster if null source
  if (source == null) return;
    
	let dag = source.dag_source();
	let sources = source.sources();
	if (sources !== null){
		for(let s of sources){
			getParentsFromSource(s, node);
		}
	}
	else if (dag === null){
		return
	}

	if (dag.inference_record()) {
		// console.log("got inference record");
		let inference_record = dag.inference_record();
		node.inference_record = inference_record.getText();

		//@=========================================================================================
		//~ ORIGINAL FROM JACK
		// let parent_list = inference_record.parents().parent_list().parent_info();

		//~ MODIFIED TO USE COMMA_PARENT_INFO
		let parent_list = [inference_record.parents().parent_list().parent_info()];
		window.parent_list = parent_list;
		window.inference_record = inference_record;

		parent_list = parent_list.concat(
			inference_record.parents().parent_list().comma_parent_info()
				.map(comma_info => comma_info.parent_info())
		);
		//@=========================================================================================
		
		// console.log("parent_list", parent_list);
		for (let i = 0; i < parent_list.length; i++) {
			let p = parent_list[i];
			let ps = p.source();

			if (ps.dag_source()){
				if (ps.dag_source().name()){
					node.parents.push(ps.getText());
				}
				else{
					try{
						let sources = [];
						window.ps = ps;
						let parents = ps.dag_source().inference_record().parents().parent_list().parent_info();
						parents = [parents, ...ps.dag_source().inference_record().parents().parent_list().comma_parent_info().map(x => x.parent_info())];
						sources = parents.map(x => x.source());
						
						for(let s of sources){
							getParentsFromSource(s, node);
						}
					}catch(e){
						console.log(`failed to parse dag source: ${ps.dag_source().getText()}`);
						console.log(e);
					}
				}
			}
			else if(ps.sources()){
				let sources = ps.sources().source();
				for(let s of sources){
					getParentsFromSource(s, node);
				}
			}
			else{
				console.log(`${node.name} has source ${source}`);
			}
		}

	} else if (dag.name()) {
		node.parents.push(dag.name().getText());
	}
}

window.getParentsFromSource = getParentsFromSource;


const Lvlregex = /level\(([0-9]+)\)/;
function getNodeLevel(source, node){
    // console.log("Getting node level", node, source);
    try{
        node.level = parseInt(node.inference_record.match(Lvlregex)[1]);
    }
    catch(e){
        window.source = source;
        if (source.internal_source() != null){
        node.level = parseInt(
            source.internal_source().getText().match(Lvlregex)[1]
        ); }
    }
    // console.log("Got node level", node.level);
}

// this class exists to format the relevant parts of the parse tree for ease of use.
// It makes it JSON. To see the schema, look at the "process" method.
class Formatter extends Listener {

	constructor() {
		super();
		this.node_map = {};
	}

	enterThf_annotated(ctx) {
		this.process(ctx, "thf");
	}

	enterTff_annotated(ctx) {
		this.process(ctx, "tff");
	}

	enterTcf_annotated(ctx) {
		this.process(ctx, "tcf");
	}

	enterFof_annotated(ctx) {
		this.process(ctx, "fof");
	}

	enterCnf_annotated(ctx) {
		this.process(ctx, "cnf");
		window.ctx = ctx;
	}

	process(ctx, type) {
		let role = ctx.formula_role().getText();
		
		if(!["conjecture", "negated_conjecture", "axiom", "plain"].includes(role)){
			console.log(`"${role}" role not shown for "${ctx.name().getText()}"`);
			return;
		}

		let node = {
			name: ctx.name().getText(),
			type: type,
			role: role,
			formula: ctx[`${type}_formula`]().getText(),
			parents: [],
			inference_record: "",
			info: {},
            level: undefined,
			tptp: ctx.parentCtx.parentCtx.getText()
		};

		// try to get node info...(contains interestingness)
		try {
			//@=========================================================================================
			//~ ORIGINAL BY JACK
			// let info = ctx.annotations().optional_info().useful_info().info_items().getText().split(",");
			//~ MODIFIED TO USE GENERAL_TERMS
			let info = ctx.annotations().optional_info().useful_info().general_list().general_terms().getText().split(",");
			//@=========================================================================================
			let infoObj = {};
			for (let s of info) {
				let [key, value] = s.split("(");
				value = value.substring(0, value.length - 1);
				infoObj[key] = value;
			}
			node.info = infoObj;
		} catch (e) {
			console.log(`"${node.name}" has no useful info (or we failed getting it)`)
			// console.log(e)
		}

		// try to get source...(contains parents)
	    let source;
		try {
            source = ctx.annotations().source();
			getParentsFromSource(source, node);
		}
		catch (e) {
			console.log(`"${node.name}" has no sources (or we failed getting them).`)
		}

        try {
            getNodeLevel(source, node);
        }
        catch (e) {
            console.log(`"${node.name}" has no level (or we failed getting it).`);
			console.log(e);
        }

		this.node_map[node.name] = node;
	}// end of process function

}// end of Formatter class


function abbreviate(label){
	if(label.length > 7){
		return label.substring(0, 4) + '...'
	}
	return label
}

// must be a higher order function so it can take in s as input...
function nodeToGV(s) {
	return function (node) {

		// What was this for? I commented it to fix an IIV bug, but I can't remember why it was here to begin with.
        /*if(node.children.length == 0 && node.parents.length == 0){
			return
		}*/

		let label = window.interpretation ? interpretationLabel(node) : node.name;
		label = node.graphviz.inviz ? "" : abbreviate(label)
		s.push(`"${node.name}" [
			fixedsize=true,
			label="${label}",
			${node.graphviz.invis ? "style=invis," : ""}
			shape=${node.graphviz.invis ? "point" : node.graphviz.shape},
			color="${node.graphviz.color}",
			fillcolor="${node.graphviz.fillcolor}",
			width="${node.graphviz.width}",
			height="${node.graphviz.height}",
			penwidth="3.0"
		]`);
	}
}



// nodes is a JSON object where the keys are node names.
// and the values are the JSON objects of the nodes.
let proofToGV = function (nodes) {

	// A higher order function which returns a function from
	// a node to whether or not that node should be in the top row of that type.
	function isTopRow(type) {
		return function (node) {
			return node.parents.every(function (parentName) {
				let parent = nodes[parentName];
				if (parent === undefined) {
					return false;
				}

				let parentType = nodes[parentName].type;
				return (parentType != type || top_row.includes(parent));
			});
		}
	}

	let nodeList = Object.values(nodes);

	// will become string segments of the "dot" file graphviz file.
	let gvLines = [];

    let top_row = [];
    let others = nodeList;

    if (!window.interpretation){
	    top_row = nodeList.filter(e => e.parents.length == 0);
	    others = nodeList.filter(e => e.parents.length != 0);
    }

	window.ns = {}; // namespace for simplifying redundant ops on thf/tff/tcf/fof/cnf...
	let langs = ["thf", "tff", "tcf", "fof", "cnf"];

	for(let lang of langs){
		ns[lang] = others.filter(e => e.type == lang);
		ns[`top_${lang}`] = ns[lang].filter(isTopRow(lang));
	}

	gvLines.push("digraph G {");
	gvLines.push("node [style=filled];");
	gvLines.push("newrank=\"true\"");

    // let clusterColor = 'lightgrey';
    let clusterColor = 'transparent';


	//begin Top Row...
	gvLines.push("subgraph clusterAxioms {");
	gvLines.push(`pencolor=${clusterColor}`);
	top_row.forEach(nodeToGV(gvLines));
    if (!window.interpretation)
	    gvLines.push("{rank=same; " + top_row.map((e) => `"${e.name}"`).join(' ') + "}");
	gvLines.push("}");
	//end Top Row

	for(let lang of langs){
        if (!window.interpretation){
	    	gvLines.push(`subgraph cluster${lang}s {`);
            gvLines.push(`pencolor=${clusterColor}`);
        }
		ns[lang].forEach(nodeToGV(gvLines));
        if (!window.interpretation) {
		    gvLines.push(`{rank=same; ` + ns[`top_${lang}`].map((e) => `"${e.name}"`).join(' ') + `}`);
		    gvLines.push(`}`);
        }
	}


    // Add Level Information to GraphViz
    window.levels = {};
    for(let node of nodeList){
        if (typeof node.level == 'number'){
            if (!Object.keys(levels).includes(`${node.level}`)){
                console.log(`Level ${node.level} not in levels, making new`);
                levels[node.level] = [];
            }
            levels[node.level].push(node.name);
        }
    }

    for(const [level, names] of Object.entries(levels)){
		gvLines.push(`{rank=same; ${names.map(x=>`"${x}"`).join(' ')}}`);
    }


    for(let node of nodeList){
		let arrowOrNot = node.graphviz.invis ? " [dir=none] " : "";
        node.parents.forEach(function (p) {gvLines.push(`"${p}"` + " -> " + `"${node.name}"` + arrowOrNot)});
    }

	gvLines.push("}");
	return gvLines.join('\n');
}


// iterative implementation for antlr4 tree walk
async function asyncWalkTreeIteratively(listener, root, batchSize = 50) {
    const stack = [];
    stack.push({ node: root, childIndex: 0, visited: false });
    let operationsCount = 0; // renamed to better reflect its purpose

    while (stack.length > 0) {
        if (operationsCount >= batchSize) {
            await new Promise(resolve => setTimeout(resolve, 0));
            operationsCount = 0;
        }

        const frame = stack[stack.length - 1];
        const node = frame.node;

        if (node instanceof TerminalNode) {
            listener.visitTerminal(node);
            stack.pop();
            // operationsCount++;  commented out: terminal nodes often very numerous, not directly processed by formatter
            continue;
        }

        if (!(node instanceof ParserRuleContext)) {
             console.error("Unexpected node type in parse tree:", node);
             stack.pop();
             // operationsCount++;
             continue;
        }

        if (!frame.visited) {
            listener.enterEveryRule(node);
            node.enterRule(listener); // This is where enterThf_annotated, etc., are called
            frame.visited = true;

            // --- OPTIMIZATION: Only count nodes that `Formatter` actually processes ---
            // since the Formatter does all the heavy lifting here
            operationsCount++; 

        }

        if (frame.childIndex < node.getChildCount()) {
            const child = node.getChild(frame.childIndex);
            frame.childIndex++;
            stack.push({ node: child, childIndex: 0, visited: false });
            continue;
        } else {
            node.exitRule(listener);
            listener.exitEveryRule(node);
            stack.pop();
        }
    }
}// end of asyncWalkTreeIteratively method

function countmeaningfullines(filestring) {
  const lines = filestring.split('\n');
  const meaningfullines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('%');

  });
  return meaningfullines.length;
}




let calculateBatchSize = function (number_proof_lines)
{
    // 230
const minbatchsize = 15;
  const maxbatchsize = 100;

  // small proofs -> smaller batch for responsiveness
  // large proofs -> larger batch for speed
  const dynamicbatch = Math.round(Math.sqrt((number_proof_lines) * 2));
//  console.log(`dynamic batch is : ${dynamicbatch}`)

  const batch_size = Math.max(minbatchsize, Math.min(maxbatchsize, dynamicbatch));

  console.log(`calculated batchsize of ${batch_size}`)
  return batch_size;

  }// end of calculateBatchSize function


let parseProof = function (proofText) {
  let startTimeParseProof = performance.now(); 

  let number_proof_lines = countmeaningfullines(proofText);
  console.log(`We found ${number_proof_lines} lines of proof to parse`)

	let chars = new antlr4.default.InputStream(proofText);
	let lexer = new Lexer(chars);
	let tokens = new antlr4.default.CommonTokenStream(lexer);
	let parser = new Parser(tokens);
	// parser.removeErrorListeners();
	parser.buildParseTrees = true;
    
  let batchSize = calculateBatchSize(number_proof_lines);
	let formatter = new Formatter();

	let tree;
	console.log("Beginning parsing...");
//  let count = 1;

      while ((tree = parser.tptp_input())) {
        if (tree.getText() == "<EOF>") break; 
 //       console.log(`while loop for async walk has ran ${count++} times.`)
        asyncWalkTreeIteratively(formatter, tree, batchSize);
      }


  let endTimeParseProof = performance.now();
  let parseProofTime = endTimeParseProof - startTimeParseProof;

	let nm = formatter.node_map;
  
  let startgraphVizTime = performance.now();

	// post-processing of node-map.
	for (let name of Object.keys(nm)) {
		let node = nm[name];

		node.graphviz = {
			shape: getNodeShape(node),
			color: getNodeColor(node),
			fillcolor: "#c0c0c0",
		};

		if (node.info['interesting'] !== undefined) {
			node.graphviz.width = scaleFromInterestingness(node.info.interesting);
			node.graphviz.height = scaleFromInterestingness(node.info.interesting);
		}

		if (node.children === undefined) {
			node.children = [];
		}

		let parentsCopy = Array.from(node['parents']);
		for (let parentName of parentsCopy) {
			if (parentName in nm) {
				if (nm[parentName]["children"] === undefined) {
					nm[parentName]["children"] = [name]
				}
				else {
					nm[parentName]["children"].push(name);
				}
			}
			else {
				console.log(`Error: ${parentName} was a parentNode of ${node["name"]}, but is not in the map!`);
				// remove the parent.
				while(node['parents'].includes(parentName)){
					console.log(`Removing ${parentName} from ${node.name}'s parents`);
					let location = node['parents'].indexOf(parentName);
					node['parents'].splice(location, 1);
				}
			}
		}
	}


  let endTimeGraphViz = performance.now();
  let graphVizTime = endTimeGraphViz - startgraphVizTime;
  

  console.log(`finished graph viz in : ${graphVizTime}`);
	console.log(`Finished our parsing in ${parseProofTime}`);
	return nm;
}


export { parseProof, proofToGV };
