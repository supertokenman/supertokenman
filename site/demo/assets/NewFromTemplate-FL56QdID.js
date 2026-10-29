import{r as i,j as t,I as b,R as x,p as j,C as v}from"./main-D-6gqpYS.js";import"./demo-BnEzuMkO.js";const n=(s,o,...d)=>({name:s,description:o,body:d.map((a,l)=>`${l+1}. ${a}`).join(`
`)}),p=[{id:"web-app",name:"Web app",what:"A browser front end with an API behind it.",persona:{id:"tpl-web-app",name:"Web app builder",color:"#4f7cff",instructions:"You build a web app. Keep components small, check every change in the browser preview, and run the tests before saying a task is done."},skills:[n("add-page","Add a page or screen to the web app.","Find how existing pages are routed and copy that pattern.","Build the page with the components already in the project.","Add a test for what the page shows.","Run the tests and open the page in the preview."),n("add-endpoint","Add an API endpoint.","Find an existing endpoint and follow its layout.","Validate the input; return clear errors.","Add a test for the success case and one failure.","Run the tests.")],claudeMd:`# Project

A web app: front end and API.

## How to work here

- Read the README and package scripts before changing anything.
- Run the tests after every change; fix what breaks before moving on.
- Keep secrets out of the code; read them from the environment.
- Small commits, one change each.
`},{id:"cli-tool",name:"CLI tool",what:"A command-line program with flags, help text and exit codes.",persona:{id:"tpl-cli-tool",name:"CLI builder",color:"#3fae6a",instructions:"You build a command-line tool. Every command has help text, clear errors and a non-zero exit code on failure. Output is plain text by default and JSON with --json."},skills:[n("add-command","Add a subcommand to the CLI.","Add the command next to the existing ones, with its usage line in the help.","Fail with a short message and exit code 1 on bad input.","Add a test that runs the command.","Run the tests and the command once by hand."),n("release-notes","Write release notes from the commits since the last tag.","List the commits since the last tag with git log.","Group them as added, changed, fixed.","Write one line each, in plain words.")],claudeMd:`# Project

A command-line tool.

## How to work here

- Keep the help text in sync with what each command does.
- Errors go to stderr, results to stdout.
- Run the tests after every change.
`},{id:"data-analysis",name:"Data analysis",what:"Notebooks or scripts that load data, check it and report findings.",persona:{id:"tpl-data-analysis",name:"Data analyst",color:"#e0a526",access:"ask",instructions:"You analyze data. Look at the data before drawing conclusions, say how many rows each number comes from, and never change the raw files."},skills:[n("profile-data","Profile a dataset before analysis.","Count rows and columns.","Report empty values, duplicates and odd ranges per column.","Write what you found to a short note next to the data."),n("write-findings","Write up the results of an analysis.","State the question first.","Give each finding with the number it rests on and how it was computed.","List what the data cannot tell.")],claudeMd:`# Project

Data analysis.

## How to work here

- Raw data is read only; write derived files to a separate folder.
- Every chart and number says where it came from.
- Prefer scripts that rerun from scratch over manual steps.
`},{id:"docs-site",name:"Docs site",what:"A documentation site written in Markdown.",persona:{id:"tpl-docs-site",name:"Docs writer",color:"#b05cff",instructions:"You write documentation. Short sentences, one idea per paragraph, real commands that work. Check every link and code sample you add."},skills:[n("new-page","Add a page to the docs.","Find where similar pages live and how the navigation lists them.","Write the page: what it is for, the steps, an example.","Add it to the navigation.","Build the site and check the page and its links."),n("check-links","Find broken links in the docs.","List every link in the Markdown files.","Check that each local target exists.","Report the broken ones with file and line.")],claudeMd:`# Project

A documentation site in Markdown.

## How to work here

- Write for someone new to the project.
- Every code sample must run as written.
- Build the site before saying a change is done.
`}];function N(s){const[o,d]=i.useState(p[0].id),[a,l]=i.useState(null),[f,g]=i.useState([]),[r,m]=i.useState([]),[u,c]=i.useState("");i.useEffect(()=>{m([]),a&&window.stm.template.plan(o,a).then(g,e=>c(e.message))},[o,a]),i.useEffect(()=>{const e=h=>h.key==="Escape"&&s.onClose();return window.addEventListener("keydown",e),()=>window.removeEventListener("keydown",e)},[s.onClose]);const w=p.find(e=>e.id===o),k=async()=>{if(a)try{const e=await window.stm.template.apply(o,a,r);c(e.text),s.onOpen(a,e.persona)}catch(e){c(e.message)}};return t.jsx("div",{className:"overlay",onMouseDown:e=>e.target===e.currentTarget&&s.onClose(),children:t.jsxs("div",{className:"sheet ports",role:"dialog","aria-label":"New project from template",children:[t.jsxs("header",{className:"sheet-head",children:[t.jsx("div",{className:"sheet-title",children:"New project from template"}),t.jsx("span",{className:"spacer-flex"}),t.jsx("button",{className:"icon","aria-label":"Close",onClick:s.onClose,children:t.jsx(b,{})})]}),t.jsxs("div",{className:"sheet-body",children:[t.jsx("p",{className:"faint",children:"Writes a CLAUDE.md, skills in .claude/skills and a persona in .supertokenman/personas. Files already there are kept unless you tick them."}),p.map(e=>t.jsxs("label",{className:"row",children:[t.jsx(x,{name:"tpl",checked:e.id===o,onChange:()=>d(e.id)})," ",t.jsx("b",{children:e.name})," ",t.jsx("span",{className:"faint",children:e.what})]},e.id)),t.jsxs("p",{className:"faint",children:["Persona: ",w.persona.name,". Skills: ",w.skills.map(e=>e.name).join(", "),"."]}),t.jsxs("p",{children:[t.jsx("button",{className:"ghost small",onClick:()=>void j("Folder for the new project").then(e=>e&&l(e)),children:a?"Change folder":"Pick a folder"})," ",t.jsx("span",{className:"faint",children:a??""})]}),a&&t.jsx("ul",{children:f.map(e=>t.jsxs("li",{children:[e.path," ",e.exists?t.jsxs("label",{className:"faint",children:[t.jsx(v,{checked:r.includes(e.path),onChange:h=>m(h.target.checked?[...r,e.path]:r.filter(y=>y!==e.path))})," already there, replace"]}):t.jsx("span",{className:"faint",children:"new"})]},e.path))}),u&&t.jsx("p",{children:u}),t.jsx("button",{className:"primary",disabled:!a,onClick:()=>void k(),children:"Create and open"})]})]})})}export{N as NewFromTemplate};
