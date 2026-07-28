package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"sealdice-template-api-scan/analyzer"
)

func main() {
	core := flag.String("core", "", "read-only SealDice core directory")
	out := flag.String("out", "", "write discovered JSON to this file")
	flag.Parse()
	if *core == "" {
		fmt.Fprintln(os.Stderr, "seal-api-scan: --core is required")
		os.Exit(2)
	}
	result, err := analyzer.Scan(*core)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seal-api-scan: %v\n", err)
		os.Exit(1)
	}
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "seal-api-scan: encode result: %v\n", err)
		os.Exit(1)
	}
	data = append(data, '\n')
	if *out == "" {
		_, _ = os.Stdout.Write(data)
		return
	}
	if err := analyzer.WriteAtomic(*out, data); err != nil {
		fmt.Fprintf(os.Stderr, "seal-api-scan: write output: %v\n", err)
		os.Exit(1)
	}
}
