import assert from 'node:assert/strict';
import {isPublicAddress,publicEndpoint} from '../src/public-address';

for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','192.168.1.1','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(isPublicAddress(ip),false,ip);
for(const ip of ['8.8.8.8','2606:4700:4700::1111']) assert.equal(isPublicAddress(ip),true,ip);
assert.throws(()=>publicEndpoint('http://example.com/mcp'));
assert.throws(()=>publicEndpoint('https://127.0.0.1/mcp'));
assert.throws(()=>publicEndpoint('https://user:password@example.com/mcp'));
assert.equal(publicEndpoint('https://example.com/mcp').hostname,'example.com');
