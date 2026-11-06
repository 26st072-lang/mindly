const fs=require('node:fs'),path=require('node:path');
const base=process.env.FIREBASE_TOOLS_LIB||path.dirname(require.resolve('firebase-tools'));
const fromCli=name=>require(path.join(base,name));
fromCli('logger').logger.silent=true;
(async()=>{
  const project='mindly1-52859',account=fromCli('auth').getGlobalDefaultAccount();
  await fromCli('requireAuth').requireAuth({...account,project,nonInteractive:true});
  const client=new (fromCli('apiv2').Client)({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1'});
  const {firestoreRuleCases}=await import('../tests/firestore-rules-cases.mjs'),cases=firestoreRuleCases();
  const response=await client.post(`/projects/${project}:test`,{source:{files:[{name:'firestore.rules',content:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}]},testSuite:{testCases:cases.map(item=>item.test)}},{skipLog:{body:true,resBody:true}});
  const issues=response.body.issues||[],results=response.body.testResults||[];
  console.log(JSON.stringify({issues,results:results.map((result,index)=>({name:cases[index].name,state:result.state,debugMessages:result.debugMessages})),passed:results.filter(item=>item.state==='SUCCESS').length,total:cases.length}));
  if(issues.some(item=>item.severity==='ERROR')||results.length!==cases.length||results.some(item=>item.state!=='SUCCESS'))process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
