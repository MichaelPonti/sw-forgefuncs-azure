
const { AuthenticationClient, DataManagementClient } = require('autodesk-forge-tools');
const fetch = require('node-fetch');
const zip = require('node-zip');
const zlib = require('zlib');

let auth = new AuthenticationClient(process.env.FORGE_CLIENT_ID, process.env.FORGE_CLIENT_SECRET);
let data = new DataManagementClient(auth);


const BASE_URL = 'https://developer.api.autodesk.com';
const DERIV_BASE_URL = 'https://developer.api.autodesk.com/derivativeservice/v2';

const SCOPES = [ 'viewables:read', 'data:read' ];
const ROLES = [
	'Autodesk.CloudPlatform.DesignDescription',
	'Autodesk.CloudPlatform.PropertyDatabase',
	'Autodesk.CloudPlatform.IndexableContent',
	'leaflet-zip',
	'thumbnail',
	'graphics',
	'preview',
	'raas',
	'pdf',
	'lod'
];



module.exports = async function (context, req) {
	try {
		context.log('JavaScript HTTP trigger function processed a request.');
		const authentication = await auth.authenticate(SCOPES);
		const urn = req.query.name;
		const manifest = await getManifest(urn, authentication.access_token);
		const items = parseManifest(manifest);
		const derivatives = items.map(async (item) => {
			let files = [];
			switch(item.mime) {
				case 'application/autodesk-svf':
					files = await getDerivativesSVF(item.urn, authentication.access_token);
					break;
				case 'application/autodesk-f2d':
					files = await getDerivativesF2D(item, authentication.access_token);
					break;
				case 'application/autodesk-db':
					files = ['objects_attrs.json.gz', 'objects_vals.json.gz', 'objects_offs.json.gz', 'objects_ids.json.gz', 'objects_avs.json.gz', item.rootFilename];
					break;
				default:
					files = [ item.rootFilename ];
					break;
			}
			console.log(files);
			return Object.assign({}, item, { files });
		});
		const urls = await Promise.all(derivatives);
		console.log(urls);
		urlList = getUrlList(urn, urls); 
		context.res = {
			body: JSON.stringify(urlList),
			status: 200
		};
	} catch (err) {
		console.log(err);
		context.res = {
			status: 400,
			body: err
		}
	}
};


function getUrlList(urn, derivatives) {
	const fetches = [];
	const manifestUrl = `${DERIV_BASE_URL}/manifest/${urn}`;
	fetches.push(manifestUrl);
	for (const derivative of derivatives) {
		const derivativeUrl = `${DERIV_BASE_URL}/derivatives/${encodeURIComponent(derivative.urn)}`;
		fetches.push(derivativeUrl);
		for (const file of derivative.files) {
			const fileUrl = `${DERIV_BASE_URL}/derivatives/${encodeURIComponent(derivative.basePath + file)}`;
			fetches.push(fileUrl);
		}
	}

	return fetches;
}

async function getManifest(urn, token) {
	const res = await fetch(`${BASE_URL}/modelderivative/v2/designdata/${urn}/manifest`, {
		compress: true,
		headers: { 'Authorization': 'Bearer ' + token }
	});

	return res.json();
}

function parseManifest(manifest) {
	const items = [];
	function parse(node) {
		if (ROLES.includes(node.role)) {
			const item = {
				guid: node.guid,
				mime: node.mime
			};
			items.push(Object.assign({}, item, getPathInfo(node.urn)));
		}
		if (node.children) {
			node.children.forEach(parse);
		}
	}

	parse({ children: manifest.derivatives });
	return items;
}


function getPathInfo(encodedUrn) {
	const urn = decodeURIComponent(encodedUrn);
	const rootFilename = urn.slice(urn.lastIndexOf('/') + 1);
	const basePath = urn.slice(0, urn.lastIndexOf('/') + 1);
	const localPath = basePath.slice(basePath.indexOf('/') + 1).replace(/^output\//, '');
	return {
		urn,
		rootFilename,
		localPath,
		basePath
	};
}


async function getDerivative(urn, token) {
	const res = await fetch(`${BASE_URL}/derivativeservice/v2/derivatives/${urn}`, {
		compress: true,
		headers: { 'Authorization': 'Bearer ' + token }
	});

	const buffer = await res.buffer();
	return buffer;
}


async function getDerivativesSVF(urn, token) {
	const data = await getDerivative(urn, token);
	const pack = new zip(data, { checkCRC32: true, base64: false });
	const manifestData = pack.files[ 'manifest.json' ].asNodeBuffer();
	const manifest = JSON.parse(manifestData.toString('utf8'));
	if (!manifest.assets) {
		return [];
	}

	return manifest.assets
		.map(asset => asset.URI)
		.filter(uri => uri.indexOf('embed:/') === -1);
}


async function getDerivativesF2D(item, token) {
	const manifestPath = item.basePath + 'manifest.json.gz';
	const data = await getDerivative(manifestPath, token);
	const manifestData = zlib.gunzipSync(data);
	const manifest = JSON.parse(manifestData.toString('utf8'));
	if (!manifest.assets) {
		return [];
	}

	return manifest.assets
		.map(asset => asset.URI)
		.filter(uri => uri.lastIndexOf('embed:/') === -1)
		.concat([ 'manifest.json.gz' ]);
}



