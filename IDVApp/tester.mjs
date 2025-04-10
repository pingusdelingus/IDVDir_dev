
import antlr4 from 'antlr4';
import MyGrammarLexer from './TPTPv9Lexer.js';
import MyGrammarParser from './TPTPv9Parser.js';
import fs from 'fs'; 

const input = fs.readFileSync('/Users/esteballs/Documents/coding stuff/IDVDir_dev/data/PUZ001+1_EP---1.1_WithInterestingness.s', 'utf8'); 

const chars = new antlr4.InputStream(input);
const lexer = new MyGrammarLexer(chars);
const tokens = new antlr4.CommonTokenStream(lexer);
const parser = new MyGrammarParser(tokens);

const tree = parser.tptp_file();


function prettyPrintTree(node, indent = '   ') {
    let output = `${indent}${node.constructor.name} - ${node.getText() || ''}\n`;
    
    for (let i = 0; i < node.getChildCount(); i++) {
        output += prettyPrintTree(node.getChild(i), indent + '  ');
    }
    return output;
}

const prettyTree = prettyPrintTree(tree, parser.ruleNames);
console.log(prettyTree);


