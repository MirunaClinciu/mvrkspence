// Deploy payment endpoints on the same modern runtime as the admin/settings
// endpoints. It supplies the complete per-request Netlify Blobs context,
// including the uncached endpoint required by strong-consistency reads.
export function paymentFunction(handler) {
    return async function paymentRequest(request) {
        let body = '';
        if (request.method === 'POST') {
            try { body = await request.text(); }
            catch (_) {
                return Response.json({ error: 'The request body could not be read.' }, {
                    status: 400,
                    headers: { 'Cache-Control': 'no-store' }
                });
            }
        }
        const result = await handler({
            httpMethod: request.method,
            body,
            isBase64Encoded: false
        });
        return new Response(result.body, {
            status: result.statusCode,
            headers: result.headers
        });
    };
}
