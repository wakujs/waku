"use client"

import React from "react"

export function TestClient(props: { serverPromise: Promise<string>} ) {
  const data = React.use(props.serverPromise);
  console.log("[React.use(props.serverPromise)]", data);
  return <div>[React.use(props.serverPromise): {data}]</div>
}
