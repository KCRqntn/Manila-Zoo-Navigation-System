import React, { useState } from "react";
import {
  useSearchAnimals,
  useCreateAnimal,
  useUpdateAnimal,
  useDeleteAnimal,
  useListCategories,
  useListMapPins,
  getSearchAnimalsQueryKey,
  type Animal,
  type AnimalInput,
  type AnimalUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Loader2, Search, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/adminApi";
import { AnimalImage } from "@/components/AnimalImage";
import { AnimalFormDialog, type PinOption } from "@/components/admin/AnimalFormDialog";

export default function AdminAnimals() {
  const [search, setSearch] = useState("");
  const { data: animals, isLoading } = useSearchAnimals({ search: search || undefined });
  const { data: categoriesData } = useListCategories();
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const { data: pinsData } = useListMapPins();
  const pins: PinOption[] = (Array.isArray(pinsData) ? pinsData : []).filter(p => p.is_active);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createAnimal = useCreateAnimal();
  const updateAnimal = useUpdateAnimal();
  const deleteAnimal = useDeleteAnimal();

  // null = adding a new animal; an animal = editing it
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Animal | null>(null);
  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (animal: Animal) => { setEditing(animal); setFormOpen(true); };

  const refresh = () => queryClient.invalidateQueries({ queryKey: getSearchAnimalsQueryKey() });

  const save = async (body: object) => {
    // The form sends every field (empty ones as null, so edits can clear them)
    if (editing) await updateAnimal.mutateAsync({ id: editing.id, data: body as AnimalUpdate });
    else await createAnimal.mutateAsync({ data: body as AnimalInput });
    toast({ title: editing ? "Animal updated" : "Animal created" });
    await refresh();
  };

  const handleDelete = async (animal: Animal) => {
    if (!confirm(`Delete ${animal.name}? Its QR codes, photos, favorites, feedback and game stops are removed too; visit statistics are kept.`)) return;
    try {
      await deleteAnimal.mutateAsync({ id: animal.id });
      toast({ title: "Animal deleted" });
      await refresh();
    } catch (err) {
      toast({ title: "Failed to delete animal", description: errorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Animal Management</h1>
          <p className="text-muted-foreground">Add, update, and manage zoo animal records, with photos.</p>
        </div>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Animal</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Animals List</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search animals..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Photo</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Scientific Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Exhibit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!animals?.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No animals found.</TableCell>
                    </TableRow>
                  ) : animals.map(animal => (
                    <TableRow key={animal.id}>
                      <TableCell>
                        <div className="h-12 w-16 overflow-hidden rounded-md bg-muted">
                          {animal.image_url
                            ? <AnimalImage src={animal.image_url} alt={animal.name} className="h-full w-full object-cover" iconClassName="w-5 h-5" sizes="64px" />
                            : <div className="flex h-full w-full items-center justify-center text-xs text-amber-700 dark:text-amber-400">No photo</div>}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {animal.name}
                        {animal.is_featured && <Star className="ml-1.5 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />}
                      </TableCell>
                      <TableCell className="italic text-muted-foreground">{animal.scientific_name || "-"}</TableCell>
                      <TableCell>{animal.category_name || "-"}</TableCell>
                      <TableCell>
                        {animal.location_name || <span className="text-amber-700 dark:text-amber-400">Not on the map</span>}
                      </TableCell>
                      <TableCell>{animal.conservation_status || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" onClick={() => openEdit(animal)} aria-label={`Edit ${animal.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(animal)}
                          disabled={deleteAnimal.isPending} aria-label={`Delete ${animal.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimalFormDialog open={formOpen} onOpenChange={setFormOpen} animal={editing} categories={categories} pins={pins} onSave={save} />
    </div>
  );
}
