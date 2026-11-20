import React, { useState } from "react";
import { 
  useListTrainingData, 
  useAddTrainingData, 
  useDeleteTrainingData,
  useUpdateTrainingData,
  useGetModelStatus,
  getGetModelStatusQueryKey,
  useSearchFaqs,
  useCreateFaq,
  useDeleteFaq,
  getListTrainingDataQueryKey,
  getSearchFaqsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, Brain, CircleCheck, CircleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminChatbotConfig() {
  const { data: trainingData, isLoading: trainingLoading } = useListTrainingData();
  const { data: faqs, isLoading: faqsLoading } = useSearchFaqs();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addTraining = useAddTrainingData();
  const deleteTraining = useDeleteTrainingData();
  const updateTraining = useUpdateTrainingData();
  const { data: modelStatus } = useGetModelStatus();
  const intents = modelStatus?.intents ?? [];

  const refreshTraining = () => {
    queryClient.invalidateQueries({ queryKey: getListTrainingDataQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetModelStatusQueryKey() });
  };

  const handleApprove = async (id: number, approved: boolean) => {
    try {
      await updateTraining.mutateAsync({ id, data: { is_validated: approved } });
      toast({ title: approved ? "Approved for the next retraining" : "Moved back to review" });
      refreshTraining();
    } catch {
      toast({ title: "Failed to update example", variant: "destructive" });
    }
  };
  const createFaq = useCreateFaq();
  const deleteFaq = useDeleteFaq();

  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [newTraining, setNewTraining] = useState({ intent: "", question: "", answer: "", language: "en" });

  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", category: "general", language: "en" });

  const handleAddTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addTraining.mutateAsync({ data: newTraining });
      toast({ title: "Example added. Approve it to include it in the next retraining." });
      refreshTraining();
      setIsTrainingOpen(false);
      setNewTraining({ intent: "", question: "", answer: "", language: "en" });
    } catch (error) {
      toast({ title: "Failed to add training data", variant: "destructive" });
    }
  };

  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFaq.mutateAsync({ data: newFaq });
      toast({ title: "FAQ created" });
      queryClient.invalidateQueries({ queryKey: getSearchFaqsQueryKey() });
      setIsFaqOpen(false);
      setNewFaq({ question: "", answer: "", category: "general", language: "en" });
    } catch (error) {
      toast({ title: "Failed to create FAQ", variant: "destructive" });
    }
  };

  const handleDeleteTraining = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteTraining.mutateAsync({ id });
      toast({ title: "Deleted" });
      refreshTraining();
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDeleteFaq = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteFaq.mutateAsync({ id });
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: getSearchFaqsQueryKey() });
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Chatbot & FAQ Configuration</h1>
      </div>

      <Tabs defaultValue="training" className="w-full">
        <TabsList>
          <TabsTrigger value="training">AI Training Data</TabsTrigger>
          <TabsTrigger value="faqs">Public FAQs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="training" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="w-5 h-5 text-primary" /> Intent model
                {modelStatus && (modelStatus.service_online
                  ? <Badge variant="secondary" className="gap-1"><CircleCheck className="w-3 h-3" /> Running</Badge>
                  : <Badge variant="destructive" className="gap-1"><CircleAlert className="w-3 h-3" /> Offline, using keyword rules</Badge>)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelStatus?.model_available ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Test accuracy</div>
                    <div className="text-2xl font-semibold tabular-nums">{((modelStatus.accuracy ?? 0) * 100).toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Keyword rules: {((modelStatus.keyword_accuracy ?? 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Macro F1</div>
                    <div className="text-2xl font-semibold tabular-nums">{(modelStatus.macro_f1 ?? 0).toFixed(3)}</div>
                    <div className="text-xs text-muted-foreground">{modelStatus.test_size} held-out test sentences</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Trained on</div>
                    <div className="text-2xl font-semibold tabular-nums">{modelStatus.train_size}</div>
                    <div className="text-xs text-muted-foreground">sentences, {modelStatus.admin_examples_used ?? 0} from admins</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Last trained</div>
                    <div className="text-sm font-medium pt-1">{modelStatus.trained_at ? new Date(modelStatus.trained_at).toLocaleString() : "Before tracking was added"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{modelStatus.base_model}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {modelStatus?.service_online === false
                    ? "The BERT service is not running, so the chatbot is matching keywords. Start it with pnpm dev:ai."
                    : "No evaluation report found for the loaded model. Retrain it to produce one."}
                </p>
              )}
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div>
                  <span className="font-medium">{modelStatus?.approved_examples ?? 0} approved</span> and{" "}
                  <span className="font-medium">{modelStatus?.pending_examples ?? 0} waiting for review</span>. Only approved examples are used in training.
                </div>
                <div className="text-muted-foreground">
                  To retrain, keep the API running and run <code className="font-mono text-xs">pnpm train:ai</code> (about 15 minutes on CPU), then restart <code className="font-mono text-xs">pnpm dev:ai</code>. The new accuracy appears here.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Dialog open={isTrainingOpen} onOpenChange={setIsTrainingOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" /> Add Training Data</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Intent Example</DialogTitle></DialogHeader>
                <form onSubmit={handleAddTraining} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Intent</Label>
                    <Select value={newTraining.intent} onValueChange={v => setNewTraining({...newTraining, intent: v})}>
                      <SelectTrigger><SelectValue placeholder="Choose what the question is about" /></SelectTrigger>
                      <SelectContent>
                        {intents.map(i => <SelectItem key={i} value={i}>{i.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>User Question Example</Label>
                    <Input value={newTraining.question} onChange={e => setNewTraining({...newTraining, question: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Answer</Label>
                    <Textarea value={newTraining.answer} onChange={e => setNewTraining({...newTraining, answer: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={newTraining.language} onValueChange={v => setNewTraining({...newTraining, language: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fil">Filipino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={addTraining.isPending || !newTraining.intent}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader><CardTitle>Training Examples</CardTitle></CardHeader>
            <CardContent>
              {trainingLoading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Intent</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Answer</TableHead>
                      <TableHead>Lang</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingData?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No examples yet. Add questions visitors ask that the chatbot gets wrong.
                        </TableCell>
                      </TableRow>
                    )}
                    {trainingData?.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.intent}</TableCell>
                        <TableCell>{item.question}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={item.answer}>{item.answer}</TableCell>
                        <TableCell className="uppercase text-xs">{item.language}</TableCell>
                        <TableCell>
                          <Switch
                            checked={!!item.is_validated}
                            onCheckedChange={v => handleApprove(item.id, v)}
                            disabled={!intents.includes(item.intent)}
                            aria-label={`Approve "${item.question}" for training`}
                            title={intents.includes(item.intent) ? undefined : "The model does not know this intent. Delete the example and add it again with a valid intent."}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteTraining(item.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faqs" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={isFaqOpen} onOpenChange={setIsFaqOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" /> Add FAQ</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Public FAQ</DialogTitle></DialogHeader>
                <form onSubmit={handleAddFaq} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Input value={newFaq.question} onChange={e => setNewFaq({...newFaq, question: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer</Label>
                    <Textarea value={newFaq.answer} onChange={e => setNewFaq({...newFaq, answer: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input value={newFaq.category} onChange={e => setNewFaq({...newFaq, category: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={newFaq.language} onValueChange={v => setNewFaq({...newFaq, language: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="fil">Filipino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createFaq.isPending}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader><CardTitle>Public FAQs</CardTitle></CardHeader>
            <CardContent>
              {faqsLoading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Answer</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Lang</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faqs?.map(faq => (
                      <TableRow key={faq.id}>
                        <TableCell className="font-medium">{faq.question}</TableCell>
                        <TableCell className="max-w-[300px] truncate" title={faq.answer}>{faq.answer}</TableCell>
                        <TableCell className="capitalize">{faq.category}</TableCell>
                        <TableCell className="uppercase text-xs">{faq.language}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFaq(faq.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
