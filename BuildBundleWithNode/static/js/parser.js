


import * as antlr4 from 'antlr4';
window.antlr4 = antlr4;

import {default as Lexer} from './TPTPLexer';
import {default as Parser} from './TPTPParser';
import {default as Listener} from './TPTPListener';

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

function getNodeLevel(source, node){
    // console.log("Getting node level", node, source);
    let regex = /level\(([0-9]+)\)/;
    try{
        node.level = parseInt(node.inference_record.match(regex)[1]);
    }
    catch(e){
        window.source = source;
        node.level = parseInt(
            source.internal_source().getText().match(regex)[1]
        );
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
//			console.log(`"${node.name}" has no useful info (or we failed getting it)`)
			// console.log(e)
		}

		// try to get source...(contains parents)
	    let source;
		try {
            source = ctx.annotations().source();
			getParentsFromSource(source, node);
		}
		catch (e) {
//			console.log(`"${node.name}" has no sources (or we failed getting them).`)
		}

        try {
            getNodeLevel(source, node);
        }
        catch (e) {
 //           console.log(`"${node.name}" has no level (or we failed getting it).`);
	//		console.log(e);
        }

		this.node_map[node.name] = node;
	}

}


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

async function asyncwalktreeiteratively(listener, root, batchsize = 50) {
  const terminalnodeclass = (typeof terminalnode !== "undefined" && terminalnode) || null;

  // stack frames include: { node, childindex, visited }
  // 'visited' indicates whether we've called enterrule on this node.
  const stack = [];
  stack.push({ node: root, childindex: 0, visited: false });
  let processedcount = 0;  

  while (stack.length > 0) {
    if (processedcount >= batchsize) {
      await new promise(resolve => settimeout(resolve, 0));
      processedcount = 0;
    }

    // peek at the top stack frame
    const frame = stack[stack.length - 1];
    const node = frame.node;


    // check for terminal node:
    if (terminalnodeclass && node instanceof terminalnodeclass) {
      listener.visitterminal(node);
      stack.pop();
      processedcount++;
      continue;
    }

    // otherwise, it's a rule node.
    if (!frame.visited) {
      // call the enter routines.
      listener.entereveryrule(node.rulecontext);
      node.rulecontext.enterrule(listener);
      frame.visited = true;
      processedcount++;
      // continue processing the same node so we start iterating its children.
      continue;
    }

    // process children if any remain.
    if (frame.childindex < node.getchildcount()) {
      const child = node.getchild(frame.childindex);
      frame.childindex++;
      // push the child with a fresh frame.
      stack.push({ node: child, childindex: 0, visited: false });
      continue;
    } else {
      // all children processed: exit the rule and pop the frame.
      node.rulecontext.exitrule(listener);
      listener.exiteveryrule(node.rulecontext);

      stack.pop();
      processedcount++;
    }

  } // end of while loop

}// end of asyncwalktreeiteratively

function countmeaningfullines(filestring) {
  const lines = filestring.split('\n');
  const meaningfullines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startswith('%');
  });
  return meaningfullines.length;
}


let calculatebatchsize = function (number_proof_lines)
{

    // 230
const minbatchsize = 20;
  const maxbatchsize = 100;

  // small proofs -> smaller batch for responsiveness
  // sarge proofs -> larger batch for speed
  const dynamicbatch = math.round(math.sqrt((number_proof_lines) * 2));
  console.log(`dynamic batch is : ${dynamicbatch}`)

  const batch_size = math.max(minbatchsize, math.min(maxbatchsize, dynamicbatch));

  console.log(`calculated batchsize of ${batch_size}`)
  return batch_size;

  }// end of calculatebatchsize function



let parseproof = function (prooftext) {
  let number_proof_lines = countmeaningfullines(prooftext);
  let divisor_to_ms = [-7];


  
  const starttime = performance.now();
	let chars = new antlr4.default.inputstream(prooftext);
	let lexer = new lexer(chars);
	let tokens = new antlr4.default.commontokenstream(lexer);
	let parser = new parser(tokens);


  console.log(`there are this many lines in this proof ${number_proof_lines}`);
  let divisor = 40;  // 
//  let batchsize = math.max(20, math.min(100, math.round(number_proof_lines / divisor)));
    let batchsize = calculatebatchsize(number_proof_lines);
	let formatter = new formatter();

	let tree;
	console.log("beginning parsing...");

  let usingiterative = true;

  if (usingiterative === true){

	while ((tree = parser.tptp_input())) {
		if (tree.gettext() == "<eof>") break;
    asyncwalktreeiteratively(formatter,tree,batchsize );
	}

  }// end of if usingiterative 
	console.log("finished parsing!")


	let nm = formatter.node_map;

	// post-processing of node-map.
	for (let name of object.keys(nm)) {
		let node = nm[name];

		node.graphviz = {
			shape: getnodeshape(node),
			color: getnodecolor(node),
			fillcolor: "#c0c0c0",
		};

		if (node.info['interesting'] !== undefined) {
			node.graphviz.width = scalefrominterestingness(node.info.interesting);
			node.graphviz.height = scalefrominterestingness(node.info.interesting);
		}

		if (node.children === undefined) {
			node.children = [];
		}

		let parentscopy = array.from(node['parents']);
		for (let parentname of parentscopy) {
			if (parentname in nm) {
				if (nm[parentname]["children"] === undefined) {
					nm[parentname]["children"] = [name]
				}
				else {
					nm[parentname]["children"].push(name);
				}
			}
			else {
				console.log(`error: ${parentname} was a parentnode of ${node["name"]}, but is not in the map!`);
				// remove the parent.
				while(node['parents'].includes(parentname)){
					console.log(`removing ${parentname} from ${node.name}'s parents`);
					let location = node['parents'].indexof(parentname);
					node['parents'].splice(location, 1);
				}
			}
		}
	}
  const endtime = performance.now()
  
  if (usingiterative == true){
  console.log(`finished parsing using iterative walk in ${endtime - starttime} ms with batchsize: ${batchsize} `)
  }
    else{
  console.log(`finished parsing using recursive walk in ${endtime - starttime} ms with batchsize:  ${batchsize}  `)
    }
  console.log("finished ");

	return nm;
}


export { parseproof, prooftogv };
