import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DataNode } from "../../types";
import { listNodes, createNode } from "../lib/api";

const API_BASE_KEY = "api_base_url";

export default function SettingsScreen() {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [newNodeName, setNewNodeName] = useState("");
  const [apiUrl, setApiUrl] = useState("http://localhost:3000");

  useEffect(() => {
    AsyncStorage.getItem(API_BASE_KEY)
      .then((v) => { if (v) setApiUrl(v); })
      .catch(console.error);

    listNodes().then(setNodes).catch(console.error);
  }, []);

  const saveApiUrl = async () => {
    await AsyncStorage.setItem(API_BASE_KEY, apiUrl);
    Alert.alert("Saved", "API URL saved.");
  };

  const handleCreateNode = useCallback(async () => {
    if (!newNodeName.trim()) return;
    try {
      const node = await createNode(newNodeName.trim());
      setNodes((n) => [...n, node]);
      setNewNodeName("");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create node");
    }
  }, [newNodeName]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      {/* API URL */}
      <Text style={styles.sectionTitle}>Server URL</Text>
      <Text style={styles.hint}>Point to your deployed Next.js app.</Text>
      <TextInput
        style={styles.input}
        value={apiUrl}
        onChangeText={setApiUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <TouchableOpacity style={styles.btn} onPress={saveApiUrl}>
        <Text style={styles.btnText}>Save URL</Text>
      </TouchableOpacity>

      {/* Data Nodes */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Data Nodes</Text>
      {nodes.map((n) => (
        <View key={n.id} style={styles.nodeCard}>
          <Text style={styles.nodeName}>{n.id}</Text>
          <Text style={styles.nodeMeta}>{n.repo} · {n.size_mb.toFixed(2)} MB</Text>
        </View>
      ))}

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="New node name"
          placeholderTextColor="#475569"
          value={newNodeName}
          onChangeText={setNewNodeName}
        />
        <TouchableOpacity style={[styles.btn, { marginLeft: 8, marginBottom: 0 }]} onPress={handleCreateNode}>
          <Text style={styles.btnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.architectureBox}>
        <Text style={styles.architectureTitle}>Architecture</Text>
        <Text style={styles.architectureText}>
          {'gitstore-master'} — Master Name Node (index.json){"\n"}
          {'gitstore-secondary'} — Secondary Name Node{"\n"}
          {'gitstore-[name]'} — Data Node repos
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: "#f1f5f9", fontSize: 20, fontWeight: "700", marginBottom: 24 },
  sectionTitle: { color: "#f1f5f9", fontSize: 14, fontWeight: "700", marginBottom: 6 },
  hint: { color: "#64748b", fontSize: 12, marginBottom: 10 },
  input: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f1f5f9",
    marginBottom: 10,
  },
  btn: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  btnText: { color: "#94a3b8", fontWeight: "600", fontSize: 14 },
  nodeCard: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  nodeName: { color: "#f1f5f9", fontWeight: "600", fontSize: 14 },
  nodeMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  architectureBox: {
    marginTop: 28,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 14,
  },
  architectureTitle: { color: "#94a3b8", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  architectureText: { color: "#475569", fontSize: 12, lineHeight: 20, fontFamily: "monospace" },
});
