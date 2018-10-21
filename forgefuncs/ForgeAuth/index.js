const { AuthenticationClient } = require('autodesk-forge-tools');
let auth = new AuthenticationClient(process.env.FORGE_CLIENT_ID, process.env.FORGE_CLIENT_SECRET);


module.exports = async function (context, req) {
    context.log('Forge Authentication for Viewer');
	try {
		const authentication = await auth.authenticate(['viewables:read']);
		console.log(authentication);
		context.res = {
			headers: { 'Content-Type': 'application/json' },
			body: authentication
		}
	} catch(err) {
		console.log(err);
		context.res = {
			status: 400,
			body: 'failed to authenticate: ' + err,
		}
	}

	// if (req.query.name || (req.body && req.body.name)) {
	// 	context.res = {
	// 		// status: 200, /* Defaults to 200 */
	// 		body: "Hello " + (req.query.name || req.body.name)
	// 	};
	// }
	// else {
	// 	context.res = {
	// 		status: 400,
	// 		body: "Please pass a name on the query string or in the request body"
	// 	};
	// }
};