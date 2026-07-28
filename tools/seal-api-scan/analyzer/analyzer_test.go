package analyzer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanFindsNestedSealExportsWithoutBuildingCore(t *testing.T) {
	root := t.TempDir()
	dice := filepath.Join(root, "dice")
	if err := os.MkdirAll(dice, 0o755); err != nil {
		t.Fatal(err)
	}
	fixture := `package dice
type ExtInfo struct { Name string ` + "`jsbind:\"name\"`" + ` }
type Dice struct{}
func Reply(s string) {}
type Adapter struct{}
func (*Adapter) Reply(_ string) {}
func (d *Dice) JsInit() {
  seal := vm.NewObject()
  ext := vm.NewObject()
  _ = ext.Set("new", func(name string) *ExtInfo { return nil })
  _ = seal.Set("ext", ext)
  _ = seal.Set("reply", Reply)
}`
	if err := os.WriteFile(filepath.Join(dice, "fixture.go"), []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}
	result, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Entries) != 3 {
		t.Fatalf("expected three entries, got %#v", result.Entries)
	}
	if result.Entries[0].Path != "seal.ext" || result.Entries[1].Path != "seal.ext.new" || result.Entries[2].Path != "seal.reply" {
		t.Fatalf("unexpected entries: %#v", result.Entries)
	}
	if result.Entries[1].FactoryReturn != "*ExtInfo" || result.Types["ExtInfo"].Fields[0].JSName != "name" {
		t.Fatalf("missing function or jsbind metadata: %#v %#v", result.Entries[1], result.Types["ExtInfo"])
	}
	if result.Entries[2].GoSignature != "func(string)" {
		t.Fatalf("scanner selected a method instead of the package function: %#v", result.Entries[2])
	}
}
